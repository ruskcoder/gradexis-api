import requests
from bs4 import BeautifulSoup

classlinkLoginData = {
    "username": "",
    "password": "",
    "os": "Windows",
    "userdn": "",
    "code": "katyisd",
    "Browser": "Chrome",
    "Resolution": "1920x1080"
}

session = requests.Session()
loginSession = session.get('https://launchpad.classlink.com/katyisd')
csrftoken = loginSession.text.split('"csrfToken":"')[1].split('"')[0]
loginSession = session.post("https://launchpad.classlink.com/login", 
                  headers={
                      'cookie': loginSession.headers['Set-Cookie'], "csrf-token": csrftoken
                  }, 
                  data=classlinkLoginData)
loginResponse = loginSession.json()
if loginResponse['ResultCode'] != 1:
    print(loginResponse['ResultDescription'])
    exit()
loginSession = session.get(loginResponse['login_url'])
loginSession = session.get(f"https://myapps.classlink.com/oauth/?code={loginResponse["login_url"].split('redirect_uri=')[1].split('&')[0]}6&response_type=code")
print(loginSession.text)