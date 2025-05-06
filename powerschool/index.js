/* eslint-disable no-undef */
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar, parseDate } = require('tough-cookie');

const app = express();

function swap(json) {
    var ret = {};
    for (var key in json) {
        ret[json[key]] = key;
    }
    return ret;
}

ps_loginData = {
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
ps_classHeaders = {
    accept: "application/json, text/plain, */*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    connection: "keep-alive",
    "content-type": "application/json;charset=UTF-8",
    // expect: "",
    "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0"
};

async function loginSession(session, loginData, link, res) {
    let loginUrl = `${link}guardian/home.html`;
    try {
        const data = await session.post(`${loginUrl}`, loginData);
        if (data.data.includes("Invalid Username or Password!")) {
            return { link: link, session: { status: 401, message: "Invalid username or password" } };
        }
        return { link: link, session: session, response: data.data };
    } catch (e) {
        return { link: link, session: { status: 500, message: "PowerSchool returned an error" } }
    }
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

function updateRes(res, req) {
    if (req.query.stream != "true") {
        res.write = function (a) { }
    }
    else {
        res.send = function (a) { res.write(JSON.stringify(a)); res.end(); };
    }
    res.writejson = function (a) { res.write(JSON.stringify(a) + "\n\n"); };
    return res;
}

async function startSession(req, res, loginDetails, mainpage = false) {
    let { link, username, password } = loginDetails;

    let userLoginData = { ...ps_loginData };
    userLoginData.account = username;
    userLoginData.dbpw = password;
    userLoginData.pw = password;
    userLoginData.ldappassword = password;

    let session = createSession();

    if (req.query.session) {
        const cookies = JSON.parse(req.query.session);
        session.defaults.jar = CookieJar.fromJSON(cookies);
        if (mainpage) {
            const data = await session.get(`${link}guardian/home.html`);
            if (data.data.includes("Invalid Username or Password!")) {
                return { link: link, session: { status: 401, message: "Invalid username or password" } };
            }
            response = data.data;
        }
        else {
            response = "";
        }
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

    const { link, session, response } = await startSession(req, res, loginDetails, mainpage = true);

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
    res = updateRes(res, req);

    res.writejson({
        percent: 0,
        message: 'Logging In...'
    });
    const { link, session, response } = await startSession(req, res, loginDetails, mainpage = true);

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
        currentTerm = req.query.term.toUpperCase();
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
        termList: termlist,
        term: currentTerm,
        classes: classes,
        session: sessionData
    });
})

app.get('/grades', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    res.writejson({
        percent: 0,
        message: 'Logging In...'
    });
    const { link, session, response } = await startSession(req, res, loginDetails, mainpage = true);

    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return;
    }
    const $ = cheerio.load(response);
    const mainTable = $('.linkDescList tbody');

    if (!req.query.term || !req.query.class) {
        res.status(400).send({ "success": false, "message": "Missing term or class parameter" });
        return;
    }
    const term = req.query.term.toUpperCase();
    const className = req.query.class;

    if (!term || !className) {
        res.status(400).send({ "success": false, "message": "Missing term or class parameter" });
        return;
    }

    let termIndex = -1;
    let classLink = null;
    let period = null;
    let teacher = null;
    let room = null;
    let average = null;

    // Find the term index
    mainTable.find('tr').first().children().each((i, el) => {
        const text = $(el).text().trim();
        if (text === term) {
            termIndex = i + 8; // Add 8 to account for the offset
        }
    });

    if (termIndex === -1) {
        res.status(400).send({ "success": false, "message": `Invalid term: ${term}` });
        return;
    }

    // Find the class and get the details
    mainTable.find('tr:gt(1)').each((_, row) => {
        const classCell = $(row).find('.table-element-text-align-start');
        const classText = classCell.clone().children().remove().end().text().trim();

        if (classText === className) {
            const cell = $(row).children().eq(termIndex);
            const link = cell.find('a').attr('href');
            if (link) {
                classLink = link;
            }

            period = $(row).find('td').eq(0).text().trim();
            teacher = classCell.find('a').eq(1).text().slice(6).trim();
            room = classCell.find('span').eq(0).find('span').eq(1).text().trim();
            average = cell.find('a').contents().last().text().trim();
            if (average === "[ i ]") average = ""; // Handle placeholder
        }
    });
    let scores = [];
    let categories = {};
    if (classLink) {
        res.writejson({
            percent: 50,
            message: 'Getting scores'
        });
        const mainpage = (await session.get(`${link}guardian/${classLink}`)).data;
        let sectionId = null;
        try {
            sectionId = mainpage.split(`data-sectionid="`)[1].split('"')[0];
        }
        catch (e) {
            res.status(400).send({ "success": false, "message": `An error occurred. Please try again. ` });
            return;
        }
        let begDate = classLink.split("begdate=")[1].split("&")[0].split('/');
        let endDate = classLink.split("enddate=")[1].split("&")[0].split('/');
        let begDateFormatted = `${begDate[2]}-${begDate[0].replace(/^0+/, '')}-${begDate[1].replace(/^0+/, '')}`;
        let endDateFormatted = `${endDate[2]}-${endDate[0].replace(/^0+/, '')}-${endDate[1].replace(/^0+/, '')}`;
        let data;
        try {
            data = (await session.post(
                `${link}ws/xte/assignment/lookup?_= ${Date.now()}`,
                {
                    "section_ids": [sectionId],
                    "start_date": begDateFormatted,
                    "end_date": endDateFormatted
                },
                { headers: { ...ps_classHeaders, referer: `${link}guardian/${classLink}` } }
            )).data;
        }
        catch (e) {
            res.status(400).send({ "success": false, "message": `An error occurred. Please try again. ` });
            return;
        }
        for (a in data) {
            assignment = data[a]['_assignmentsections'][0];
            let duedate = assignment.duedate.split('-');
            let score = assignment['_assignmentscores']
            let badges = []
            if (!assignment.iscountedinfinalgrade) {
                badges.push('exempt');
            }
            if (score.length > 0) {
                if (score[0].isexempt) {
                    badges.push('exempt');
                }
                if (score[0].ismissing) {
                    badges.push('missing');
                }
                if (score[0].islate) {
                    badges.push('late');
                }
                if (score[0].isabsent) {
                    badges.push('absent');
                }
                if (score[0].isincomplete) {
                    badges.push('incomplete');
                }
            }
            let current = {
                name: assignment.name,
                category: assignment['_assignmentcategoryassociations'][0]['_teachercategory'].name,
                totalPoints: assignment.totalpointvalue,
                weight: assignment.weight,
                weightedTotalPoints: assignment.weight * assignment.totalpointvalue,
                score: score.length > 0 ? score[0].scorepoints : "",
                weightedScore: score.length > 0 ? score[0].scorepoints * assignment.weight : "",
                percentage: score.length > 0 ? score[0]['scorepercent'] + "%" : "",
                dateDue: `${duedate[1]}/${duedate[2]}/${duedate[0]}`,
                dateAssigned: `${duedate[1]}/${duedate[2]}/${duedate[0]}`,
                badges: badges
            }
            if (current.score != "" && !badges.includes("exempt")) {
                if (Object.keys(categories).includes(current.category)) {
                    categories[current.category].studentsPoints += parseFloat(current.weightedScore);
                    categories[current.category].maximumPoints += parseFloat(current.weightedTotalPoints);
                }
                else {
                    categories[current.category] = {
                        studentsPoints: parseFloat(current.weightedScore),
                        maximumPoints: parseFloat(current.weightedTotalPoints),
                    }
                }
            }
            scores.push(current);
        }
        for (let category in categories) {
            let weight = 100 / Object.keys(categories).length;
            let percent = ((categories[category].studentsPoints / categories[category].maximumPoints) * 100);
            categories[category].percent = percent + "%";
            categories[category].categoryWeight = weight;
            categories[category].categoryPoints = ((percent / 100) * weight);
        }
    }

    const sessionData = session.defaults.jar.toJSON();
    res.send({
        term: term,
        course: className,
        name: className,
        period: period,
        teacher: teacher,
        room: room,
        average: average,
        scores: scores,
        categories: categories,
        session: sessionData
    });
});

module.exports = app;