import requests
import re
url = 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c?searchCondition=1&searchKeyword=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
r.encoding = 'utf-8'

# Search for article.view definition
scripts = re.findall(r'<script[\s\S]*?>([\s\S]*?)<\/script>', r.text)
print("Found", len(scripts), "script tags.")
for i, s in enumerate(scripts):
    if 'article.view' in s or 'articleSeq' in s or 'function' in s:
        # print first 1000 chars of the matching script
        lines = s.split('\n')
        for line in lines:
            if 'view' in line or 'Seq' in line or 'submit' in line or 'location' in line:
                print(f"Script {i+1} line: {line.strip()}")
