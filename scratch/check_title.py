import requests
from bs4 import BeautifulSoup

url = 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c?articleSeq=171986'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
r.encoding = 'utf-8' # Force UTF-8 encoding
soup = BeautifulSoup(r.text, 'html.parser')

print("Title tag:", soup.title.text.strip())

# Search for any article view titles
title_tag = soup.find(class_=re.compile('title', re.I)) if 're' in globals() else None
# Let's search for divs with classes
for d in soup.find_all('div'):
    cls = ' '.join(d.get('class', [])) if d.get('class') else ''
    if 'title' in cls or 'subject' in cls or 'view' in cls:
        text = d.text.strip().replace('\n', ' ')
        if len(text) > 5:
            print(f"[{cls}]: {text[:150]}")

# Print all h1, h2, h3, h4 tags
for h in ['h1','h2','h3','h4']:
    tags = soup.find_all(h)
    for t in tags:
        print(f"{h}: {t.text.strip()}")
