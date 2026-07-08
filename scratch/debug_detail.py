import requests
import re
from bs4 import BeautifulSoup

url = 'https://www.motie.go.kr/kor/article/ATCL3f49a5a8c?articleSeq=171986'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
soup = BeautifulSoup(r.text, 'html.parser')
links = soup.find_all('a', href=re.compile(r'/attach/down/'))

print('Total attach links:', len(links))
for i, l in enumerate(links):
    print(f"Link {i+1}: {l.get('href')} | Text: {l.text.strip()}")
    p = l.parent
    chain = []
    while p and p.name != '[document]':
        cls = ' '.join(p.get('class', [])) if p.get('class') else ''
        id_ = p.get('id', '')
        chain.append(f"{p.name}(class='{cls}', id='{id_}')")
        p = p.parent
    print("  Path:", " -> ".join(reversed(chain)))
