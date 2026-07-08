import requests
from bs4 import BeautifulSoup
import re

url = 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c/171986/view'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
r.encoding = 'utf-8'

soup = BeautifulSoup(r.text, 'html.parser')
print("Title of the page:", soup.title.text.strip())

# Search for /attach/down/ links
links = soup.find_all('a', href=re.compile(r'/attach/down/'))
print("Found", len(links), "attachment links:")
for i, l in enumerate(links):
    # Print the parent tag name and class to identify where it is
    parent_info = ""
    p = l.parent
    if p:
        parent_info = f"{p.name}.{'.'.join(p.get('class', [])) if p.get('class') else ''}"
    print(f"Link {i+1}: {l.get('href')} | Text: {l.text.strip()} | Parent: {parent_info}")
