import os
import re
import json
import datetime
import smtplib
import matplotlib
import matplotlib.pyplot as plt
import fitz  # PyMuPDF
from google import genai
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.application import MIMEApplication
from playwright.sync_api import sync_playwright

BASE_URL = 'https://www.motie.go.kr'

# 보조자료 PDF 제외 키워드 (그래프, 캡처 등 보조자료는 제외)
EXCLUDE_KEYWORDS = ['그래프', '캡처', '참고', '별첨', '붙임', 'ICT', '정보통신']


def get_latest_report():
    now = datetime.datetime.now()
    # 산업부는 매월 1일에 전월 데이터를 발표 (7월 1일 → 6월 수출입 동향)
    target_month = now.month - 1
    target_year = now.year
    if target_month == 0:
        target_month = 12
        target_year -= 1

    print(f"[1] 대상: {target_year}년 {target_month}월 수출입 동향")
    os.makedirs("file", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        # 게시판 검색 페이지 이동
        search_url = (
            f"{BASE_URL}/kor/article/ATCL3f49a5a8c"
            f"?searchCondition=1&searchKeyword=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5"
        )
        page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2000)  # 동적 콘텐츠 렌더링 대기
        print("[2] 게시판 로딩 완료")

        # 게시물 제목 링크 수집
        links = page.query_selector_all("table tbody tr td a")
        post_title = None
        matched_href = None

        for link in links:
            title = (link.text_content() or "").strip()
            href = link.get_attribute("href") or ""
            if (f"{target_year}년" in title and
                    f"{target_month}월" in title and
                    "수출입" in title and
                    "동향" in title and
                    "정보통신" not in title):
                post_title = title
                matched_href = href
                print(f"[3] 게시물 발견: {post_title}")
                break

        if not post_title:
            print("[!] 게시물을 찾지 못했습니다.")
            browser.close()
            return None, None

        # article.view('ID') 에서 ID 추출
        match = re.search(r"article\.view\('(\d+)'\)", matched_href)
        if not match:
            print(f"[!] 게시물 ID를 추출할 수 없습니다: {matched_href}")
            browser.close()
            return None, None

        article_id = match.group(1)
        detail_url = f"{BASE_URL}/kor/article/ATCL3f49a5a8c?articleSeq={article_id}"
        page.goto(detail_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2000)  # 동적 콘텐츠 렌더링 대기
        print(f"[4] 게시물 상세 페이지 로딩 완료 (ID: {article_id})")

        # 첨부파일 링크 목록 수집
        attach_links = page.query_selector_all("a[href*='/attach/down/']")
        print(f"[5] 첨부파일 {len(attach_links)}개 발견")

        # 모든 PDF 후보를 수집 후 메인 보고서 우선 선택
        pdf_candidates = []
        for i, attach_link in enumerate(attach_links):
            href = attach_link.get_attribute("href") or ""
            try:
                with page.expect_download(timeout=20000) as dl_info:
                    attach_link.click()
                download = dl_info.value
                suggested = download.suggested_filename
                if suggested.lower().endswith('.pdf'):
                    pdf_candidates.append((suggested, download))
                    print(f"  [{i+1}] PDF 발견: {suggested}")
                else:
                    download.cancel()
            except Exception as e:
                print(f"  [{i+1}] 건너뜀: {e}")
                continue

        # 메인 보고서 PDF 선택 우선순위:
        # 1) 제외 키워드 없는 것 우선
        # 2) 파일명에 '동향' 포함된 것 우선
        save_path = None
        best = None
        for filename, download in pdf_candidates:
            has_exclude = any(kw in filename for kw in EXCLUDE_KEYWORDS)
            has_trend = '동향' in filename
            if not has_exclude and has_trend:
                best = (filename, download)
                break

        # 조건 맞는 게 없으면 제외 키워드 없는 첫번째
        if not best:
            for filename, download in pdf_candidates:
                has_exclude = any(kw in filename for kw in EXCLUDE_KEYWORDS)
                if not has_exclude:
                    best = (filename, download)
                    break

        # 그래도 없으면 첫번째 PDF
        if not best and pdf_candidates:
            best = pdf_candidates[0]

        # 나머지 다운로드 취소
        for filename, download in pdf_candidates:
            if best and filename == best[0]:
                continue
            try:
                download.cancel()
            except Exception:
                pass

        if best:
            filename, download = best
            save_path = f"file/{filename}"
            download.save_as(save_path)
            print(f"[6] PDF 저장 완료: {save_path}")

        browser.close()

    if save_path:
        return save_path, post_title
    else:
        print("[!] PDF 파일을 다운로드하지 못했습니다.")
        return None, None


def analyze_pdf(pdf_path):
    print("[7] PDF 텍스트 추출 중...")
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    text = text[:15000]

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

    print("[8] Gemini AI 분석 중...")
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
    print("[9] 그래프 생성 완료")


def send_email(subject, summary, pdf_file=None):
    sender = os.environ.get("EMAIL_SENDER")
    password = os.environ.get("EMAIL_PASSWORD")
    receiver = os.environ.get("EMAIL_RECEIVER")

    if not all([sender, password, receiver]):
        print("[!] 이메일 환경변수 미설정 (EMAIL_SENDER / EMAIL_PASSWORD / EMAIL_RECEIVER)")
        return

    print(f"[10] 이메일 발송 중 → {receiver}")
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
    print("[11] 이메일 발송 완료!")


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
