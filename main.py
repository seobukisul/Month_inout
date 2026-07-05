import os
import requests
from bs4 import BeautifulSoup
import datetime
import re
import fitz  # PyMuPDF
import google.generativeai as genai
import json
import matplotlib.pyplot as plt
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

def get_latest_report():
    now = datetime.datetime.now()
    target_month = now.month
    
    url = "https://www.motie.go.kr/kor/article/ATCL3f49a5a8c?searchCondition=1&searchKeyword=수출입+동향"
    
    try:
        response = requests.get(url, verify=False)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        articles = soup.select('table tbody tr')
        for article in articles:
            title_element = article.select_one('td.txtL a')
            if not title_element: continue
            
            title = title_element.text.strip()
            
            if f"{target_month}월" in title and "수출입" in title and "동향" in title:
                post_url = "https://www.motie.go.kr" + title_element['href']
                
                post_response = requests.get(post_url, verify=False)
                post_soup = BeautifulSoup(post_response.text, 'html.parser')
                
                file_links = post_soup.find_all('a', href=re.compile(r'download'))
                for link in file_links:
                    if link.text and '.pdf' in link.text.lower():
                        pdf_url = "https://www.motie.go.kr" + link['href']
                        pdf_data = requests.get(pdf_url, verify=False).content
                        with open("report.pdf", "wb") as f:
                            f.write(pdf_data)
                        return "report.pdf", title
                
                pdf_link = post_soup.find('a', href=re.compile(r'\.pdf$'))
                if pdf_link:
                    pdf_url = "https://www.motie.go.kr" + pdf_link['href']
                    pdf_data = requests.get(pdf_url, verify=False).content
                    with open("report.pdf", "wb") as f:
                        f.write(pdf_data)
                    return "report.pdf", title
    except Exception as e:
        print(f"Scraping error: {e}")
        
    return None, None

def analyze_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()

    # Get first 15000 characters to avoid huge payload
    text = text[:15000] 

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set")
        
    genai.configure(api_key=api_key)
    # Using gemini-1.5-flash which is extremely fast and cost-effective (free tier available)
    model = genai.GenerativeModel('gemini-1.5-flash', generation_config={"response_mime_type": "application/json"})
    
    prompt = f"""
    다음은 이번 달 산업통상자원부의 수출입 동향 PDF 텍스트입니다.
    1. 주요 산업별(반도체, 자동차, 철강 등) 수출입 동향을 500자 이내로 핵심만 요약해줘.
    2. 시각화를 위해 주요 품목별 수출 증감률(%) 데이터를 추출해줘. 
    반환 형식은 반드시 아래 JSON 구조와 정확히 일치해야 해.
    {{"summary": "요약 내용", "data": {{"반도체": 15.2, "자동차": -3.1, "철강": 2.5}}}}
    데이터가 있는 주요 품목만 포함해줘.
    
    텍스트:
    {text}
    """
    
    response = model.generate_content(prompt)
    result = json.loads(response.text)
    return result['summary'], result['data']

def create_graph(data_dict):
    plt.rcParams['font.family'] = 'sans-serif'
    
    items = list(data_dict.keys())
    rates = list(data_dict.values())
    
    plt.figure(figsize=(10, 6))
    colors = ['#ff9999' if x > 0 else '#66b3ff' for x in rates]
    plt.bar(items, rates, color=colors)
    
    plt.title('Export Growth Rate by Major Item (%)', fontsize=15)
    plt.axhline(0, color='black', linewidth=1)
    plt.xticks(rotation=45)
    
    for i, v in enumerate(rates):
        plt.text(i, v, str(v), ha='center', va='bottom' if v > 0 else 'top')
        
    plt.tight_layout()
    plt.savefig('export_graph.png')
    plt.close()

def send_email(subject, summary):
    sender = os.environ.get("EMAIL_SENDER")
    password = os.environ.get("EMAIL_PASSWORD")
    receiver = os.environ.get("EMAIL_RECEIVER")
    
    if not sender or not password or not receiver:
        print("Email credentials are not fully set in environment variables. Skipping email.")
        return
        
    smtp_server = "smtp.gmail.com"
    smtp_port = 587
    
    msg = MIMEMultipart()
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = receiver
    
    msg.attach(MIMEText(summary, 'plain', 'utf-8'))
    
    if os.path.exists('export_graph.png'):
        with open('export_graph.png', 'rb') as f:
            img_data = f.read()
        image = MIMEImage(img_data, name="export_graph.png")
        msg.attach(image)
    
    server = smtplib.SMTP(smtp_server, smtp_port)
    server.starttls()
    server.login(sender, password)
    server.sendmail(sender, receiver, msg.as_string())
    server.quit()

if __name__ == "__main__":
    print("Starting process...")
    pdf_file, post_title = get_latest_report()
    if pdf_file:
        print(f"Downloaded report from post: {post_title}")
        summary, data = analyze_pdf(pdf_file)
        print("Generated summary and extracted data.")
        create_graph(data)
        print("Generated graph.")
        send_email(post_title, summary)
        print("Process completed and email sent.")
    else:
        print("Could not find the report for this month.")
