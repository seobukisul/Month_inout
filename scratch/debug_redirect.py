import requests
url = 'https://www.motie.go.kr/kor/article/ATCL3f49a5a8c?articleSeq=171986'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, verify=False)
print("Final URL:", r.url)
print("History:", r.history)
print("Status Code:", r.status_code)
# Search for any attach down links in the raw HTML text
import re
matches = re.findall(r'href=["\']([^"\']*/attach/down/[^"\']*)["\']', r.text)
print("Regex match count for /attach/down/:", len(matches))
for m in matches[:5]:
    print("  ", m)
# Print first 2000 chars of HTML to check if there is an iframe or redirect
print("\nFirst 1000 chars of HTML:")
print(r.text[:1000])
