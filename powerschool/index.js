/* eslint-disable no-undef */
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();

function swap(json) {
    var ret = {};
    for (var key in json) {
        ret[json[key]] = key;
    }
    return ret;
}

loginData = {
    dbpw: "",
    translator_username: "",
    translator_password: "",
    translator_ldappassword: "",
    returnUrl: "",
    serviceName: "PS Parent Portal",
    serviceTicket: "",
    pcasServerUrl: "/",
    credentialType: "User Id and Password Credential",
    ldappassword: "",
    request_locale: "en_US",
    account: "",
    pw: "",
    translatorpw: "",
}


async function loginSession(session, loginData, link, res) {
    let loginUrl = `${link}guardian/home.html`;
    try {
        const data = await session.post(`${loginUrl}`, loginData);
        if (data.data.includes("Invalid Username or Password!")) {
            return { link: link, session: { status: 401, message: "Invalid username or password" } };
        }
        return { link: link, session: session, response: data.data };
    } catch (e) {
        return { link: link, session: { status: 500, message: "HAC is broken again" } }
    }
    return { link: link, session: session };
}

function formatLink(link) {
    if (!link) return undefined;
    link = link.trim();
    link = link.endsWith('/') ? link.slice(0, -1) : link;
    link = link.endsWith("/public") ? link.slice(0, -11) : link;
    link = link + "/"
    link = link.startsWith('http') ? link : 'https://' + link;
    return link;
}

function createSession() {
    const jar = new CookieJar();
    let session = wrapper(axios.create({
        withCredentials: true,
        jar,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }));
    return session;
}

function verifyLogin(req, res) {
    if (!req.query.username || !req.query.password || !(req.query.classlink || req.query.link)) {
        res.status(400).send({ "success": false, "message": `Missing one or more required parameters` });
        return false;
    } else {
        return { link: formatLink(req.query.link), username: req.query.username, password: req.query.password };
    }
}

async function startSession(req, res, loginDetails) {
    let { link, username, password } = loginDetails;

    let userLoginData = { ...loginData };
    userLoginData.account = username;
    userLoginData.dbpw = password;
    userLoginData.pw = password;
    userLoginData.ldappassword = password;

    let session = createSession();

    if (req.query.session) {
        const cookies = JSON.parse(req.query.session);
        session.defaults.jar = CookieJar.fromJSON(cookies);
    } else {
        ({ link, session, response } = await loginSession(session, userLoginData, link, res));
    }
    return { link: link, session: session, response: response };
}

app.get('/', (req, res) => {
    res.send('PowerSchool App');
});

app.get('/login', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;

    const { link, session, response } = await startSession(req, res, loginDetails);

    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }
    const sessionData = session.defaults.jar.toJSON();
    res.send({
        session: sessionData
    });
})

app.get('/info', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;

    const { link, session, response } = await startSession(req, res, loginDetails);

    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }
    const $ = cheerio.load(response);
    const studentName = $('#firstlast').text().trim();
    const district = $('#print-school').clone().children().remove().end().text().trim();
    const school = $('#print-school span').text().trim();
    const sessionData = session.defaults.jar.toJSON();
    res.send({
        name: studentName,
        district: district,
        school: school,
        dob: "",
        language: "",
        grade: "",
        counselor: "",
        link: link,
        session: sessionData
    });
})

app.get('/classes', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;

    const { link, session, response } = await startSession(req, res, loginDetails);

    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }
    const $ = cheerio.load(response);
    const mainTable = $('.linkDescList tbody');

    // Calculate termlist
    const result = {};
    mainTable.find('tr').first().children().each((i, el) => {
        const text = $(el).text().trim();
        if (text.length === 2) result[i + 8] = text;
    });
    const validRows = {};
    mainTable.find('tr:gt(1)').each((_, row) => {
        $(row).children().each((colIndex, cell) => {
            const key = result[colIndex];
            if (key && ($(cell).hasClass('notInSession') || $(cell).text().trim() === '[ i ]')) {
                validRows[key] = (validRows[key] || 0) + 1;
            }
        });
    });
    Object.keys(validRows).forEach(key => {
        if (validRows[key] === mainTable.find('tr').length - 5) delete validRows[key];
    });
    const termlist = Object.keys(validRows)

    let currentTerm;
    if (req.query.term) {
        if (!termlist.includes(req.query.term)) {
            res.status(400).send({ "success": false, "message": `Invalid term ${req.query.term}` });
            return;
        }
        currentTerm = req.query.term;
    }
    else {
        currentTerm = termlist[termlist.length - 1];
    }

    const classes = [];
    mainTable.find('.table-element-text-align-start').each((i, el) => {
        let gradeContents = $(el).parent().find('td').eq(swap(result)[currentTerm]).find('a').contents().last().text().trim();
        if (gradeContents == "[ i ]") gradeContents = "";
        classes.push({
            course: $(el).clone().children().remove().end().text().trim(),
            name: $(el).clone().children().remove().end().text().trim(),
            period: $(el).parent().find('td').eq(0).text().trim(),
            teacher: $(el).find('a').eq(1).text().slice(6),
            room: $(el).find('span').eq(0).find('span').eq(1).text().trim(),
            // letterGrade: $(el).parent().find('td').eq(swap(result)[currentTerm]).find('a').contents().first().text().trim(),
            average: gradeContents,
        });
    })

    const sessionData = session.defaults.jar.toJSON();
    res.send({
        scoresIncluded: false,
        termlist: termlist,
        term: currentTerm,
        classes: classes,
        session: sessionData
    });
})


module.exports = app;