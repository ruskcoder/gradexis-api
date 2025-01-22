/* eslint-disable no-undef */
// WIP
const axios = require('axios');
const session = axios.create({ withCredentials: true });

let classlinkLoginData = {
  "username": process.env["USERNAME"], // deleted password
  "password": process.env["PASSWORD"],
  "os": "Windows",
  "userdn": "",
  "code": "katyisd",   // district name
  "Browser": "Chrome",
  "Resolution": "1920x1080"
}

async function login() {
    try {
        let clSession = await session.get('https://launchpad.classlink.com/katyisd');
        let csrftoken = clSession.data.split('"csrfToken":"')[1].split('"')[0];
        console.log(csrftoken);

        // clSession = await session.post("https://launchpad.classlink.com/login", {
        //     headers: {
        //         'cookie': clSession.headers['set-cookie'].join('; '),
        //         'csrf-token': csrftoken,
        //     },
        //     data: classlinkLoginData
        // });

        // let loginResponse = clSession.data;
        // if (loginResponse['ResultCode'] != 1) {
        //     console.log(loginResponse['ResultDescription']);
        //     process.exit();
        // }

        // clSession = await session.get(loginResponse['login_url']);
        // clSession = await session.get(`https://myapps.classlink.com/oauth/?code=${loginResponse["login_url"].split('redirect_uri=')[1].split('&')[0]}&response_type=code`);
        // console.log(clSession.data);
    } catch (error) {
        console.error(error);
    }
}

login();