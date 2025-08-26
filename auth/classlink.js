async function loginClassLink(session, clsession, search) { 
    await session.defaults.jar.setCookie(
        `clsession=${clsession}; Domain=.classlink.com; Path=/`,
        'https://classlink.com'
    );
    let r = await session.get("https://launchpad.classlink.com/");
    if (r.data.includes('Find your login page')) {
        return { link: "", session: { status: 401, message: "Invalid Session. Maybe you signed out? Or something else went wrong. Try signing in again." } };
    }
    let jsLink = "https://myapps.classlink.com/main" + r.data.split("main")[1].split('"')[0];
    let js = await session.get(jsLink);
    let clientId = js.data.split('clientId:"')[1].split('"')[0];
    let auth1 = await session.get(
        `https://launchpad.classlink.com/oauth2/v2/auth?scope=full&redirect_uri=https%3A%2F%2Fmyapps.classlink.com%2Foauth%2F&client_id=${clientId}&response_type=code`,
        { maxRedirects: 0, validateStatus: status => status >= 200 && status < 400 }
    );
    let code = auth1.headers.location.split("code=")[1].split("&")[0];
    await session.get(auth1.headers.location);
    let exchangeCode = await session.get(`https://myapps.apis.classlink.com/exchangeCode?code=${code}&response_type=code`);
    let token = exchangeCode.data.token || exchangeCode.data.access_token || exchangeCode.data;
    let clapps = (await session.get('https://applications.apis.classlink.com/v1/v3/applications?',
        {
            headers: { 'Authorization': `Bearer ${token}` }
        }
    )).data;
    let returnLink = clapps.find(app => app.name.toLowerCase().includes(search.toLowerCase())).url[0];
    return { link: returnLink, session: session, exchangeCode: exchangeCode };
}
module.exports = { loginClassLink };