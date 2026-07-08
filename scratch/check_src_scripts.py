import requests
from bs4 import BeautifulSoup

url = 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c?searchCondition=1&searchKeyword=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
r.encoding = 'utf-8'

soup = BeautifulSoup(r.text, 'html.parser')
scripts = soup.find_all('script')
print("Found", len(scripts), "scripts with src:")
for s in scripts:
    if s.get('src'):
        src = s.get('src')
        print("  ", src)
        # If it looks like board or article or common script, download and search for article.view
        if any(w in src for w in ['board', 'article', 'common', 'script']):
            js_url = 'https://www.motir.go.kr' + src if src.startswith('/') else src
            try:
                js_r = requests.get(js_url, verify=False)
                if 'article.view' in js_r.text or 'articleSeq' in js_r.text:
                    print(f"    -> FOUND article.view inside {src}!")
                    # Print lines containing view
                    for line in js_r.text.split('\n'):
                        if 'view' in line or 'Seq' in line or 'submit' in line:
                            print("      ", line.strip())
            except Exception as e:
                print("    Error downloading:", e)
