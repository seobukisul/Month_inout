import os
import re
import json
import datetime
import smtplib
import warnings
import requests
import matplotlib
import matplotlib.pyplot as plt
import fitz  # PyMuPDF
from google import genai
from bs4 import BeautifulSoup
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.application import MIMEApplication
from urllib.parse import unquote

# 로컬 실행 시 .env 파일에서 환경변수 로드
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

warnings.filterwarnings('ignore')

BASE_URL = 'https://www.motie.go.kr'
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
}
# 보조자료 PDF 제외 키워드
EXCLUDE_KEYWORDS = ['그래프', '캡처', '참고', '별첨', '붙임', '보도참고']


def get_latest_report():
    now = datetime.datetime.now()
    target_month = now.month - 1
    target_year = now.year
    if target_month == 0:
        target_month = 12
        target_year -= 1

    print(f"[1] 대상: {target_year}년 {target_month}월 수출입 동향")
    os.makedirs("file", exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)
    session.verify = False

    # Step 1: 메인 게시판 방문 (세션 쿠키 획득)
    try:
        session.get(f"{BASE_URL}/kor/article/ATCL3f49a5a8c", timeout=20)
        print("[2] 게시판 접속 성공")
    except Exception as e:
        print(f"[!] 게시판 접속 실패: {e}")
        return find_cached_pdf(target_year, target_month)

    # Step 2: 검색 결과에서 게시물 ID 추출
    search_url = (
        f"{BASE_URL}/kor/article/ATCL3f49a5a8c"
        f"?searchCondition=1&searchKeyword=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5"
    )
    try:
        resp = session.get(search_url, timeout=20)
        soup = BeautifulSoup(resp.text, 'html.parser')
    except Exception as e:
        print(f"[!] 검색 페이지 접속 실패: {e}")
        return find_cached_pdf(target_year, target_month)

    article_id = None
    post_title = None

    for a in soup.find_all('a', href=re.compile(r"article\.view\(")):
        title = a.text.strip()
        href = a.get('href', '')
        if (f"{target_year}년" in title and
                f"{target_month}월" in title and
                "수출입" in title and "동향" in title and
                "정보통신" not in title):
            match = re.search(r"article\.view\('(\d+)'\)", href)
            if match:
                article_id = match.group(1)
                post_title = title
                print(f"[3] 게시물 발견: {post_title} (ID: {article_id})")
                break

    if not article_id:
        print("[!] 게시물을 찾지 못했습니다. 캐시된 PDF를 사용합니다.")
        return find_cached_pdf(target_year, target_month)

    # Step 3: 상세 페이지 방문 후 첨부파일 URL 수집
    detail_url = f"{BASE_URL}/kor/article/ATCL3f49a5a8c?articleSeq={article_id}"
    session.headers.update({'Referer': search_url})
    try:
        r2 = session.get(detail_url, timeout=20)
        soup2 = BeautifulSoup(r2.text, 'html.parser')
    except Exception as e:
        print(f"[!] 상세 페이지 접속 실패: {e}")
        return find_cached_pdf(target_year, target_month)

    attach_links = soup2.find_all('a', href=re.compile(r'/attach/down/'))
    print(f"[4] 첨부파일 {len(attach_links)}개 발견")

    if not attach_links:
        print("[!] 첨부파일 없음. 캐시된 PDF를 사용합니다.")
        return find_cached_pdf(target_year, target_month)

    # Step 4: 첨부파일 다운로드 시도 (Referer 헤더 포함)
    session.headers.update({'Referer': detail_url})
    pdf_candidates = []

    for i, link in enumerate(attach_links):
        file_url = BASE_URL + link['href']
        try:
            r3 = session.get(file_url, timeout=30)
            cd = r3.headers.get('Content-Disposition', '')
            ct = r3.headers.get('Content-Type', '')
            fname_match = re.search(r"filename\*?=['\"]?(?:UTF-8'')?([^'\";\n]+)", cd)
            filename = unquote(fname_match.group(1).strip()) if fname_match else f"attach_{i+1}.bin"
            is_pdf = r3.content[:4] == b'%PDF'
            size = len(r3.content)
            print(f"  [{i+1}] {filename} | PDF={is_pdf} | Size={size:,}bytes")

            if is_pdf and size > 10000:  # 10KB 이상인 진짜 PDF만
                pdf_candidates.append((filename, r3.content, size))
        except Exception as e:
            print(f"  [{i+1}] 다운로드 실패: {e}")

    if not pdf_candidates:
        print("[!] PDF 다운로드 실패. 캐시된 PDF를 사용합니다.")
        return find_cached_pdf(target_year, target_month)

    # 메인 보고서 PDF 선택: 제외 키워드 없고 가장 큰 파일
    pdf_candidates.sort(key=lambda x: x[2], reverse=True)
    for filename, content, size in pdf_candidates:
        has_exclude = any(kw in filename for kw in EXCLUDE_KEYWORDS)
        if not has_exclude:
            save_path = f"file/{filename}"
            with open(save_path, 'wb') as f:
                f.write(content)
            print(f"[5] PDF 저장 완료: {save_path} ({size:,} bytes)")
            return save_path, post_title

    # 조건 맞는 게 없으면 가장 큰 PDF 사용
    filename, content, size = pdf_candidates[0]
    save_path = f"file/{filename}"
    with open(save_path, 'wb') as f:
        f.write(content)
    print(f"[5] PDF 저장 완료 (대체): {save_path} ({size:,} bytes)")
    return save_path, post_title


def find_cached_pdf(target_year, target_month):
    """file/ 폴더에서 가장 최근 PDF를 찾아 사용"""
    print("[!] 캐시된 PDF 검색 중...")
    if not os.path.exists("file"):
        return None, None
    pdfs = [f for f in os.listdir("file") if f.lower().endswith('.pdf')]
    if not pdfs:
        return None, None
    # 가장 최근 수정된 PDF 선택
    pdfs.sort(key=lambda f: os.path.getmtime(f"file/{f}"), reverse=True)
    path = f"file/{pdfs[0]}"
    title = f"{target_year}년 {target_month}월 수출입 동향 (캐시)"
    print(f"[!] 캐시 PDF 사용: {path}")
    return path, title


def analyze_pdf(pdf_path):
    print("[6] PDF 텍스트 추출 중...")
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    text = text[:15000]

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

    print("[7] Gemini AI 분석 중...")
    client = genai.Client(api_key=api_key)

    prompt = f"""
    다음은 산업통상자원부의 수출입 동향 PDF 텍스트입니다.
    1. 주요 산업별(반도체, 자동차, 철강, 석유화학, 바이오헬스 등) 수출입 동향을 600자 이내로 핵심만 요약해줘.
    2. 시각화를 위해 주요 품목별 수출 증감률(%) 데이터를 추출해줘.
    반환 형식은 반드시 아래 JSON 구조와 정확히 일치해야 해:
    {{"summary": "요약 내용", "data": {{"반도체": 15.2, "자동차": -3.1, "철강": 2.5}}}}
    데이터가 있는 주요 품목만 포함해줘.

    텍스트:
    {text}
    """

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"}
    )
    result = json.loads(response.text)
    return result['summary'], result['data']


def create_graph(data_dict):
    matplotlib.use('Agg')
    plt.rcParams['font.family'] = 'sans-serif'

    items = list(data_dict.keys())
    rates = list(data_dict.values())

    fig, ax = plt.subplots(figsize=(12, 7))
    colors = ['#ff6b6b' if x > 0 else '#4dabf7' for x in rates]
    bars = ax.bar(items, rates, color=colors, edgecolor='white', linewidth=0.5)

    ax.set_title('Export Growth Rate by Major Item (%)', fontsize=16, pad=15)
    ax.axhline(0, color='black', linewidth=1)
    ax.set_ylabel('Growth Rate (%)')
    plt.xticks(rotation=30, ha='right')

    for bar, v in zip(bars, rates):
        ax.text(bar.get_x() + bar.get_width() / 2, v,
                f'{v:+.1f}%', ha='center',
                va='bottom' if v >= 0 else 'top', fontsize=9)

    plt.tight_layout()
    plt.savefig('export_graph.png', dpi=150)
    plt.close()
    print("[8] 그래프 생성 완료")


def send_email(subject, summary, pdf_file=None):
    sender = os.environ.get("EMAIL_SENDER")
    password = os.environ.get("EMAIL_PASSWORD")
    receiver = os.environ.get("EMAIL_RECEIVER")

    if not all([sender, password, receiver]):
        print("[!] 이메일 환경변수 미설정")
        return

    print(f"[9] 이메일 발송 중 → {receiver}")
    msg = MIMEMultipart()
    msg['Subject'] = f"[수출입 동향] {subject}"
    msg['From'] = sender
    msg['To'] = receiver
    msg.attach(MIMEText(summary, 'plain', 'utf-8'))

    if os.path.exists('export_graph.png'):
        with open('export_graph.png', 'rb') as f:
            image = MIMEImage(f.read(), name="export_graph.png")
        msg.attach(image)

    if pdf_file and os.path.exists(pdf_file):
        with open(pdf_file, 'rb') as f:
            pdf_att = MIMEApplication(f.read(), _subtype="pdf")
        pdf_att.add_header('Content-Disposition', 'attachment',
                           filename=os.path.basename(pdf_file))
        msg.attach(pdf_att)

    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(sender, password)
    server.sendmail(sender, receiver, msg.as_string())
    server.quit()
    print("[10] 이메일 발송 완료!")


if __name__ == "__main__":
    print("=" * 50)
    print("산업통상자원부 수출입 동향 자동화 시작")
    print("=" * 50)

    pdf_file, post_title = get_latest_report()
    if pdf_file:
        summary, data = analyze_pdf(pdf_file)
        print(f"\n[요약]\n{summary}\n")
        create_graph(data)
        send_email(post_title, summary, pdf_file)
        print("\n모든 작업 완료!")
    else:
        print("\n이번 달 보고서를 찾지 못했습니다.")
