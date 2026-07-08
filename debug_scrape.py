"""검색 결과 행에서 제목+첨부파일 동시 추출 테스트"""
import re, warnings, requests
from bs4 import BeautifulSoup
from urllib.parse import unquote

warnings.filterwarnings('ignore')
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
BASE_URL = 'https://www.motie.go.kr'

session = requests.Session()
session.headers.update(HEADERS)
session.verify = False

search_url = (
    f"{BASE_URL}/kor/article/ATCL3f49a5a8c"
    f"?searchCondition=1&searchKeyword=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5"
)
r = session.get(search_url, timeout=15)
soup = BeautifulSoup(r.text, 'html.parser')

# mytable의 각 행 분석 - 제목 링크와 첨부 링크가 같은 tr에 있는지 확인
rows = soup.select('table#mytable tbody tr')
print(f"총 행 수: {len(rows)}")
print()

for i, row in enumerate(rows[:5]):
    # 제목 링크
    title_link = row.find('a', href=re.compile(r'article\.view'))
    title = title_link.text.strip() if title_link else '(제목없음)'

    # 첨부파일 링크들
    attach_links = row.find_all('a', href=re.compile(r'/attach/down/'))

    print(f"[행 {i+1}] 제목: {title}")
    print(f"         첨부파일 수: {len(attach_links)}")
    for a in attach_links:
        print(f"         - {a['href']}")
    print()
