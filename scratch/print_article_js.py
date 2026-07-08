import requests
url = 'https://www.motir.go.kr/js/site/article/Article.js'
r = requests.get(url, verify=False)
print("Article.js Length:", len(r.text))
print("Article.js content:")
print(r.text)
