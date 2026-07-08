import requests
from bs4 import BeautifulSoup

url = 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c?searchCondition=1&searchKeyword=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
r.encoding = 'utf-8'

soup = BeautifulSoup(r.text, 'html.parser')
forms = soup.find_all('form')
print("Found", len(forms), "forms.")
for i, f in enumerate(forms):
    print(f"Form {i+1}: name={f.get('name')} | action={f.get('action')} | method={f.get('method')}")
    # print all hidden inputs
    inputs = f.find_all('input')
    for inp in inputs:
        print(f"  Input: name={inp.get('name')} | type={inp.get('type')} | value={inp.get('value')}")
