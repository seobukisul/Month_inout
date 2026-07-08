"""2036 bytes HTML 내용 확인"""
import re, warnings, requests
from bs4 import BeautifulSoup
warnings.filterwarnings('ignore')
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
BASE_URL = 'https://www.motie.go.kr'

session = requests.Session()
session.headers.update(HEADERS)
session.verify = False
session.get(f"{BASE_URL}/kor/article/ATCL3f49a5a8c", timeout=15)

detail_url = f"{BASE_URL}/kor/article/ATCL3f49a5a8c?articleSeq=171986"
r2 = session.get(detail_url, timeout=15)
soup2 = BeautifulSoup(r2.text, 'html.parser')
attach_links = soup2.find_all('a', href=re.compile(r'/attach/down/'))

file_url = BASE_URL + attach_links[0]['href']
resp = session.get(file_url, timeout=30)
print("Status:", resp.status_code)
print("Headers:", dict(resp.headers))
print()
print("Body:")
print(repr(resp.text[:1000]))
