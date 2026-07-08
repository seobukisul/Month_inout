import requests
import re
url = 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c?searchCondition=1&searchKeyword=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
r.encoding = 'utf-8'

scripts = re.findall(r'<script[\s\S]*?>([\s\S]*?)<\/script>', r.text)
# find the script that contains frm.submit()
for s in scripts:
    if 'frm.submit()' in s:
        print(s)
        break
