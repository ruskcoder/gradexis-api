/* eslint-disable no-undef */
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { HttpCookieAgent, HttpsCookieAgent } = require('http-cookie-agent/http');
const { validate } = require('tough-cookie/dist/validators');

const app = express();
const port = 4000;

hac_monthInputs = {
    'january': 0, 'jan': 0, '01': 0, 1: 0,
    'february': 1, 'feb': 1, '02': 1, 2: 1,
    'march': 2, 'mar': 2, '03': 2, 3: 2,
    'april': 3, 'apr': 3, '04': 3, 4: 3,
    'may': 4, '05': 4, 5: 4,
    'june': 5, 'jun': 5, '06': 5, 6: 5,
    'july': 6, 'jul': 6, '07': 6, 7: 6,
    'august': 7, 'aug': 7, '08': 7, 8: 7,
    'september': 8, 'sept': 8, 'sep': 8, '09': 8, 9: 8,
    'october': 9, 'oct': 9, 10: 9,
    'november': 10, 'nov': 10, 11: 10,
    'december': 11, 'dec': 11, 12: 11,
}
hac_monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
hac_loginData = {
    "__RequestVerificationToken": "",
    "SCKTY00328510CustomEnabled": true,
    "SCKTY00436568CustomEnabled": true,
    "Database": 10,
    "VerificationOption": "UsernamePassword",
    "LogOnDetails.UserName": "",
    "tempUN": "",
    "tempPW": "",
    "LogOnDetails.Password": "",
}
hac_classlinkLoginData = {
    username: '',
    password: '',
    os: 'Windows',
    userdn: '',
    code: 'katyisd',
    Browser: 'Chrome',
    Resolution: '1920x1080'
};
hac_termData = {
    "__EVENTTARGET": "ctl00$plnMain$btnRefreshView",
    "__EVENTARGUMENT": "",
    "__LASTFOCUS": "",
    "__VIEWSTATEGENERATOR": "B0093F3C",
    "ctl00$plnMain$ddlReportCardRuns": "",
}
hac_monthData = {
    "__EVENTTARGET": "ctl00$plnMain$cldAttendance",
    "__EVENTARGUMENT": "",
    "__VIEWSTATE": "",
    "__VIEWSTATEGENERATOR": "C0F72E2D",
    "__EVENTVALIDATION": "",
    "ctl00$plnMain$hdnValidMHACLicense": "N",
    "ctl00$plnMain$hdnPeriod": "",
    "ctl00$plnMain$hdnAttendance": "",
    "ctl00$plnMain$hdnDismissTime": "",
    "ctl00$plnMain$hdnArriveTime": "",
    "ctl00$plnMain$hdnColorLegend": "",
    "ctl00$plnMain$hdnCalTooltip": "",
    "ctl00$plnMain$hdnCalPrvMthToolTip": "",
    "ctl00$plnMain$hdnCalNxtMthToolTip": "",
    "ctl00$plnMain$hdnMultipleAttendenceCodes": "Multiple Attendance Codes",
    "ctl00$plnMain$hdnSchoolClosed": "School Closed",
    "ctl00$plnMain$hdnLegendNoCodes": "Attendance Codes could not be found.",
    "ctl00$plnMain$hdnHyperlinkText_exist": "(Alerts Are Limited. Click to View List of Selected Choices.)",
    "ctl00$plnMain$hdnHyperlinkText_Noexist": "(Limit Alerts to Specific Types of Attendance)",
}
hac_monthHeaders = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
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

function splitClassHeaderAndCourseName(c) {
    const parts = c.split(' ');
    const classHeader = parts.slice(0, 3).join(' ');
    const courseName = parts.slice(3).join(' ');
    return { classHeader, courseName };
}

async function loginSession(session, loginData, link, clDistrict = "", res) {
    if (clDistrict) {
        let clLoginData = { ...hac_classlinkLoginData };
        clLoginData.username = loginData['LogOnDetails.UserName'];
        clLoginData.password = loginData['LogOnDetails.Password'];
        clLoginData.code = clDistrict;

        let clSession = await session.get('https://launchpad.classlink.com/katyisd');
        let csrftoken = clSession.data.split('"csrfToken":"')[1].split('"')[0];
        let cookies = clSession.headers['set-cookie'].join('; ');
        res.writejson({
            percent: 24,
            message: 'Logging in to ClassLink'
        })
        let loginResponse = await session.post(
            'https://launchpad.classlink.com/login',
            clLoginData,
            {
                headers: {
                    'cookie': cookies,
                    'csrf-token': csrftoken,
                }
            }
        );

        let clLoginResult = loginResponse.data
        if (clLoginResult.ResultCode == 0) {
            return { link: link, session: { status: 401, message: clLoginResult.ResultDescription } }
        }
        else {
            if (!link) {
                res.writejson({
                    percent: 34,
                    message: 'Fetching HAC URL'
                })
                let code = (await session.get(clLoginResult['login_url'], {
                    maxRedirects: 0,
                    validateStatus: (status) => {
                        return status >= 200 && status < 400;
                    }
                })).headers.location.split('code=')[1].split('&')[0];
                let token = (await session.get(
                    `https://myapps.apis.classlink.com/exchangeCode?code=${code}&response_type=code
                `)).data.token
                let clapps = (await session.get('https://applications.apis.classlink.com/v1/v3/applications?',
                    {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }
                )).data;
                link = 'https://' + clapps.find(app => app.name.toLowerCase().includes('hac') || app.name.toLowerCase().includes('home access')).url[0].split('/')['2'] + '/';
            }
            res.writejson({
                percent: 46,
                message: 'Logging into HAC'
            })
            await session.get(link + "HomeAccess/District/Student/SSO", {
                headers: {
                    'cookie': cookies,
                },
            });
        }
    }
    else {
        if (loginData['LogOnDetails.UserName'] == process.env.TESTUSER && loginData['LogOnDetails.Password'] == process.env.TESTPSSWD) {
            loginData['LogOnDetails.UserName'] = process.env.USERNAME;
            loginData['LogOnDetails.Password'] = process.env.PASSWORD;
        }

        let loginUrl = `${link}HomeAccess/Account/LogOn`;
        const { data: loginResponse } = await session.get(loginUrl);
        const loginCheerio = cheerio.load(loginResponse);
        loginData["__RequestVerificationToken"] = loginCheerio("input[name='__RequestVerificationToken']").val();
        try {
            const data = await session.post(loginUrl, loginData);
            if (data.data.includes("incorrect") || data.data.includes("invalid")) {
                return { link: link, session: { status: 401, message: "Invalid username or password" } };
            }
            return { link: link, session: session };
        } catch (e) {
            return { link: link, session: { status: 500, message: "HAC is broken again" } }
        }
    }
    return { link: link, session: session };
}

function formatLink(link) {
    if (!link) return undefined;
    link = link.trim();
    link = link.endsWith('/') ? link.slice(0, -1) : link;
    link = link.endsWith("/HomeAccess") ? link.slice(0, -11) : link;
    link = link + "/"
    link = link.startsWith('http') ? link : 'https://' + link;
    return link;
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

    let userLoginData = { ...hac_loginData };
    userLoginData['LogOnDetails.UserName'] = username;
    userLoginData['LogOnDetails.Password'] = password;

    let session = createSession();

    if (req.query.session) {
        const cookies = JSON.parse(req.query.session);
        session.defaults.jar = CookieJar.fromJSON(cookies);
        if (!link) {
            link = formatLink(cookies.cookies.find(cookie => cookie.key === '.AuthCookie').domain);
        }
    } else {
        ({ link, session } = await loginSession(session, userLoginData, link, req.query.classlink, res));
    }
    return { link: link, session: session };
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

app.get('/', (req, res) => {
    res.send("HAC API")
});

app.get('/login', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);

    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }
    const registration = await session.get(link + "HomeAccess/Content/Student/Registration.aspx");
    if (registration.data.includes("Welcome to")) {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return;
    }
    const sessionData = session.defaults.jar.toJSON();
    res.send({
        session: sessionData
    });
})

app.get('/info', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);


    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }
    const registration = await session.get(link + "HomeAccess/Content/Student/Registration.aspx");
    if (registration.data.includes("Welcome to")) {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return;
    }
    const $ = cheerio.load(registration.data);
    let ret = {};
    if ($("span#plnMain_lblRegStudentName").length) {
        ret["name"] = $("span#plnMain_lblRegStudentName").text().trim();
        ret["grade"] = $("span#plnMain_lblGrade").text().trim();
        ret["school"] = $("span#plnMain_lblBuildingName").text().trim();
        ret["dob"] = $("span#plnMain_lblBirthDate").text().trim();
        ret["counselor"] = $("span#plnMain_lblCounselor").text().trim();
        ret["language"] = $("span#plnMain_lblLanguage").text().trim();
        ret["cohort-year"] = $("span#plnMain_lblCohortYear").text().trim();
    }
    if (ret["name"] == process.env.MYNAME) {
        ret["name"] = "Test User";
    }
    const sessionData = session.defaults.jar.toJSON()
    res.send({
        ...ret,
        link: link,
        session: sessionData,
    });
    return;
});

app.get('/classes', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    res.writejson({
        percent: 0,
        message: 'Logging In...'
    });
    const { link, session } = await startSession(req, res, loginDetails);

    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }
    res.writejson({
        percent: 50,
        message: 'Fetching classes'
    });
    var scores = await session.get(link + "HomeAccess/Content/Student/Assignments.aspx");
    if (scores.data.includes("Welcome to")) {
        res.status(401).send({ "success": false, "message": "Invalid Session" });
        return;
    }
    var $ = cheerio.load(scores.data);
    if (req.query.term) {
        res.writejson({
            percent: 70,
            message: 'Going to term'
        });
        let newTerm = { ...hac_termData };
        var viewstate = $('input[name="__VIEWSTATE"]').val();
        var eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
        var year = $('select[name="ctl00$plnMain$ddlReportCardRuns"] option').eq(1).val().substring(2);
        newTerm["ctl00$plnMain$ddlReportCardRuns"] = `${req.query.term}-${year}`;
        newTerm["__VIEWSTATE"] = viewstate;
        newTerm["__EVENTVALIDATION"] = eventvalidation;
        scores = await session.post(link + "HomeAccess/Content/Student/Assignments.aspx", newTerm);
        $ = cheerio.load(scores.data);
    }
    res.writejson({
        percent: 83,
        message: 'Crunching data'
    });
    const schedule = await session.get(link + "HomeAccess/Content/Student/Classes.aspx");
    const $$ = cheerio.load(schedule.data);

    const classes = [];
    $('.AssignmentClass .sg-header .sg-header-heading:not(.sg-right)').each(function () {
        classes.push($(this).text().trim());
    });
    let term = $('#plnMain_ddlReportCardRuns').find('option[selected="selected"]').text().trim();
    let termList = $('#plnMain_ddlReportCardRuns').find('option').toArray().map(e => $(e).text().trim()).slice(1);
    const courses = classes.map(c => {
        const { classHeader, courseName } = splitClassHeaderAndCourseName(c);
        return classHeader.trim();
    });
    let ret = {};

    $$('.sg-asp-table-data-row').each(function () {
        const courseText = $(this).children().first().text().trim();
        if (courses.includes(courseText)) {
            ret[courseText] = {
                course: courseText,
                name: $(this).children().eq(1).find('a').text().trim(),
                period: $(this).children().eq(2).text().trim().substring(0, 1),
                teacher: $(this).children().eq(3).text().trim(),
                room: $(this).children().eq(4).text().trim(),
            };
        }
    });
    $('.AssignmentClass').each(function () {
        const classHeader = splitClassHeaderAndCourseName($(this).find('.sg-header .sg-header-heading').text().trim()).classHeader.trim();
        if (!ret[classHeader]) {
            ret[classHeader] = {
                course: classHeader,
                name: splitClassHeaderAndCourseName($(this).find('.sg-header .sg-header-heading').eq(0).text().trim()).courseName.trim(),
                period: "dropped",
            }
        }
        ret[classHeader].average = $(this).find('.sg-header .sg-header-heading.sg-right').text().trim().split(' ').pop().slice(0, -1);
        ret[classHeader].scores = [];

        $(this).find('.sg-content-grid > .sg-asp-table > tbody > .sg-asp-table-data-row').each(function () {
            let assignment = {
                name: $(this).children().eq(2).children().first().text().trim(),
                category: $(this).children().eq(3).text().trim(),
                percentage: $(this).children().eq(9).text().trim(),
                score: $(this).children().eq(4).text().trim(),
                totalPoints: parseFloat($(this).children().eq(5).text().trim()) || "",
                weight: parseFloat($(this).children().eq(6).text().trim()) || "",
                weightedScore: parseFloat($(this).children().eq(7).text().trim()) || "",
                weightedTotalPoints: parseFloat($(this).children().eq(8).text().trim()) || "",
                dateDue: $(this).children().eq(0).text().trim(),
                dateAssigned: $(this).children().eq(1).text().trim(),
                badges: []
            };
            if (assignment.score && assignment.score.includes('Missing')) {
                assignment.badges.push("missing");
                assignment.score = 0;
            }
            if (assignment.score && assignment.score.includes('Exempt')) {
                assignment.badges.push("exempt");
                assignment.score = ""
            }
            assignment.score = parseFloat(assignment.score) || assignment.score;
            ret[classHeader].scores.push(assignment);
        });
        ret[classHeader].categories = {};
        $(this).find('.sg-content-grid .sg-asp-table-group tr.sg-asp-table-data-row').each(function () {
            const category = {
                studentsPoints: $(this).children().eq(1).text().trim(),
                maximumPoints: $(this).children().eq(2).text().trim(),
                percent: $(this).children().eq(3).text().trim(),
                categoryWeight: $(this).children().eq(4).text().trim(),
                categoryPoints: $(this).children().eq(5).text().trim(),
            };
            ret[classHeader].categories[$(this).children().eq(0).text().trim()] = category;
        });
    });
    ret = Object.values(ret);
    const sessionData = session.defaults.jar.toJSON()
    res.send({
        scoresIncluded: true,
        termList: termList,
        term: term,
        classes: ret,
        session: sessionData,
    });
    return;
});

app.get('/grades', async (req, res) => {
    if (!req.query.class) {
        return res.status(400).send({ success: false, message: "Missing required parameters (class)" });
    }
    const { data: classesData } = await axios.get(`${req.protocol}://${req.get('host')}/hac/classes`, { params: req.query });
    const currentClass = classesData.classes.find(c => c.name === req.query.class);
    res.send(
        {
            term: classesData.term,
            ...currentClass,
            session: classesData.session
        });
});

app.get('/schedule', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);


    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }
    const registration = await session.get(link + "HomeAccess/Content/Student/Classes.aspx");
    if (registration.data.includes("Welcome to")) {
        res.status(401).send({ "success": false, "message": "Invalid Session" });
        return;
    }
    const $ = cheerio.load(registration.data);
    let ret = [];
    let cols = [];
    $('.sg-asp-table-header-row').children().each(function () {
        cols.push($(this).text().trim());
    });
    $('.sg-asp-table-data-row').each(function () {
        let current = {};
        $(this).children().each(function (i) {
            current[cols[i]] = $(this).text().trim();
        });
        ret.push(current);
    });
    const sessionData = session.defaults.jar.toJSON()
    res.send({
        schedule: ret,
        session: sessionData,
    });
    return;
});

app.get('/attendance', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);


    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return
    }

    if (req.query.date) {
        var reqMonth = req.query.date.split('-')[0];
        var reqYear = req.query.date.split('-')[1];
        var monthIndex = hac_monthInputs[reqMonth.toLowerCase()];
        if (monthIndex === -1) {
            res.status(400).send({ "success": false, "message": "Invalid month name" });
            return;
        }
    }

    const attendance = await session.get(link + "HomeAccess/Content/Attendance/MonthlyView.aspx");
    if (attendance.data.includes("Welcome to")) {
        res.status(401).send({ "success": false, "message": "Invalid Session" });
        return;
    }
    var $ = cheerio.load(attendance.data);

    const jan1 = new Date(2000, 0, 1);
    const targetDate = new Date(reqYear, monthIndex, 1);
    const monthCode = Math.floor((targetDate - jan1) / 86400000);

    if (req.query.date) {
        // eslint-disable-next-line no-constant-condition
        let maxloops = 15;
        let loops = 0;
        while (loops < maxloops) {
            loops++;
            let newMonth = { ...hac_monthData };
            newMonth["__VIEWSTATE"] = $('input[name="__VIEWSTATE"]').val();
            newMonth["__EVENTVALIDATION"] = $('input[name="__EVENTVALIDATION"]').val();

            let prevelem = $('a[title="Go to the previous month"]')
            let prev;
            let nextelem = $('a[title="Go to the next month"]');
            let next;

            if (!prevelem.text() || !nextelem.text()) {
                const sessionData = session.defaults.jar.toJSON()
                res.send({
                    month: hac_monthNames[monthIndex],
                    year: reqYear,
                    events: {},
                    session: sessionData,
                });
                return;
            }
            else {
                prev = parseInt(prevelem.attr('href').split('\'')[3].slice(1));
                next = parseInt(nextelem.attr('href').split('\'')[3].slice(1));
            }

            if (monthCode <= prev) {
                newMonth['__EVENTARGUMENT'] = `V${prev}`
                const attendance = await session.post(link + "HomeAccess/Content/Attendance/MonthlyView.aspx", newMonth);
                $ = cheerio.load(attendance.data);
            }
            else if (monthCode >= next) {
                newMonth['__EVENTARGUMENT'] = `V${next}`
                const attendance = await session.post(link + "HomeAccess/Content/Attendance/MonthlyView.aspx", newMonth);
                $ = cheerio.load(attendance.data);
            }
            else {
                break;
            }
        }
    }

    let events = {};
    let key = {};
    let mo = $('#plnMain_cldAttendance > tbody > tr:nth-child(1) > td > table > tbody > tr > td:nth-child(2)').text().trim();

    $('.sg-clearfix div').each(function () {
        key[$(this).children().eq(0).attr('style').substring(18).split(';')[0].toLowerCase()] = $(this).children().eq(1).text();
    });
    $('.sg-asp-calendar tr').slice(2).find('td').each(function (index) {
        if (![0, 6].includes(index % 7)) {
            let date = $(this).text() + " " + mo;
            const dateParts = date.split(' ');
            const month = new Date(dateParts[1] + ' 1, 2000').getMonth() + 1;
            const formattedDate = `${month}/${dateParts[0]}/${dateParts[2].slice(-2)}`;
            if ($(this).attr('title')) {
                events[formattedDate] = {
                    event: $(this).attr('title').split('\n')[1],
                    color: $(this).attr('bgcolor').toLowerCase()
                };
            } else {
                if ($(this).attr('style')) {
                    let color = $(this).attr('style').substring(17).split(';')[0].toLowerCase();
                    events[formattedDate] = { event: key[color], color: color };
                }
            }
        }
    });

    const sessionData = session.defaults.jar.toJSON()
    res.send({
        // prev: prev,
        // next: next,
        month: mo.split(' ')[0],
        year: mo.split(' ')[1],
        events: events,
        session: sessionData,
    });
    return;
});

app.get('/teachers', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);


    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        console.log(session.message);
        return
    }
    const registration = await session.get(link + "HomeAccess/Content/Student/Classes.aspx");
    if (registration.data.includes("Welcome to")) {
        res.status(401).send({ "success": false, "message": "Invalid Session" });
        return;
    }
    const $ = cheerio.load(registration.data);
    let ret = [];
    $('.sg-asp-table-data-row').each(function () {
        let current = {};
        current['class'] = $(this).children().eq(1).text().trim();
        const teacherInfo = $(this).children().eq(3).find('a');
        current['email'] = String(teacherInfo.attr('href')).replace('mailto:', '').trim();
        current['teacher'] = teacherInfo.text().trim();
        ret.push(current);
    });
    const sessionData = session.defaults.jar.toJSON()
    res.send({
        teachers: ret,
        session: sessionData,
    });
    return;
});

app.get('/ipr', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);


    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return;
    }

    const progressReportUrl = link + "HomeAccess/Content/Student/InterimProgress.aspx";
    const { data: progressReportPage } = await session.get(progressReportUrl);
    const $ = cheerio.load(progressReportPage);

    const options = $('#plnMain_ddlIPRDates option').toArray().reverse();
    const reports = [];

    for (const option of options) {
        const value = $(option).attr('value');
        const selectedText = $(option).text().trim();

        $('#plnMain_ddlIPRDates').val(value);

        const viewstate = $('input[name="__VIEWSTATE"]').val();
        const eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
        const data = {
            __EVENTTARGET: 'ctl00$plnMain$ddlIPRDates',
            __EVENTARGUMENT: '',
            __VIEWSTATE: viewstate,
            __EVENTVALIDATION: eventvalidation,
            'ctl00$plnMain$ddlIPRDates': value,
        };

        const { data: updatedPage } = await session.post(progressReportUrl, data);
        const $$ = cheerio.load(updatedPage);

        let report = [];
        $$('#plnMain_dgIPR .sg-asp-table-data-row').each(function () {
            let current = {};
            current['course'] = $(this).children().eq(0).text().trim();
            current['description'] = $(this).children().eq(1).text().trim();
            current['period'] = $(this).children().eq(2).text().trim();
            current['teacher'] = $(this).children().eq(3).text().trim();
            current['room'] = $(this).children().eq(4).text().trim();
            current['grade'] = $(this).children().eq(5).text().trim();
            current['com1'] = $(this).children().eq(6).text().trim();
            current['com2'] = $(this).children().eq(7).text().trim();
            current['com3'] = $(this).children().eq(8).text().trim();
            current['com4'] = $(this).children().eq(9).text().trim();
            current['com5'] = $(this).children().eq(10).text().trim();
            report.push(current);
        });

        const commentLegendTable = $$('.sg-asp-table[id*="CommentLegend"]');
        let comments = [];

        commentLegendTable.find('tr.sg-asp-table-data-row').each(function () {
            let commentRow = {}
            commentRow['comment'] = $(this).children().eq(0).text().trim();
            commentRow['commentDescription'] = $(this).children().eq(1).text().trim();
            comments.push(commentRow);
        });
        report.push({ comments: comments });

        reports.push({ date: selectedText, report });
    }

    const sessionData = session.defaults.jar.toJSON();
    res.send({
        progressReports: reports,
        session: sessionData,
    });
    return;
});

app.get('/reportCard', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);


    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return;
    }

    const reportCardUrl = link + "HomeAccess/Content/Student/ReportCards.aspx";
    const { data: reportCardPage } = await session.get(reportCardUrl);
    const $ = cheerio.load(reportCardPage);

    const options = $('#plnMain_ddlRCRuns option').toArray().reverse();
    const reports = [];

    for (const option of options) {
        const value = $(option).attr('value');
        const selectedText = $(option).text().trim();

        $('#plnMain_ddlRCRuns').val(value);

        const viewstate = $('input[name="__VIEWSTATE"]').val();
        const eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
        const data = {
            __EVENTTARGET: 'ctl00$plnMain$ddlRCRuns',
            __EVENTARGUMENT: '',
            __VIEWSTATE: viewstate,
            __EVENTVALIDATION: eventvalidation,
            'ctl00$plnMain$ddlRCRuns': value,
        };

        const { data: updatedPage } = await session.post(reportCardUrl, data);
        const $$ = cheerio.load(updatedPage);

        let report = [];
        $$('.sg-asp-table-data-row').each(function () {
            let current = {};
            current['course'] = $(this).children().eq(0).text().trim();
            current['description'] = $(this).children().eq(1).text().trim();
            current['period'] = $(this).children().eq(2).text().trim();
            current['teacher'] = $(this).children().eq(3).text().trim();
            current['room'] = $(this).children().eq(4).text().trim();
            current['att_credit'] = $(this).children().eq(5).text().trim();
            current['ern_credit'] = $(this).children().eq(6).text().trim();
            current['first'] = $(this).children().eq(7).text().trim();
            current['second'] = $(this).children().eq(8).text().trim();
            current['third'] = $(this).children().eq(9).text().trim();
            current["exam1"] = $(this).children().eq(10).text().trim();
            current["sem1"] = $(this).children().eq(11).text().trim();
            current["fourth"] = $(this).children().eq(12).text().trim();
            current["fifth"] = $(this).children().eq(13).text().trim();
            current["sixth"] = $(this).children().eq(14).text().trim();
            current["exam2"] = $(this).children().eq(15).text().trim();
            current["sem2"] = $(this).children().eq(16).text().trim();
            current["eoy"] = $(this).children().eq(17).text().trim();
            current["cnd1"] = $(this).children().eq(18).text().trim();
            current["cnd2"] = $(this).children().eq(19).text().trim();
            current["cnd3"] = $(this).children().eq(20).text().trim();
            current["cnd4"] = $(this).children().eq(21).text().trim();
            current["cnd5"] = $(this).children().eq(22).text().trim();
            current["cnd6"] = $(this).children().eq(23).text().trim();
            current["c1"] = $(this).children().eq(24).text().trim();
            current["c2"] = $(this).children().eq(25).text().trim();
            current["c3"] = $(this).children().eq(26).text().trim();
            current["c4"] = $(this).children().eq(27).text().trim();
            current["c5"] = $(this).children().eq(28).text().trim();
            current["exda"] = $(this).children().eq(29).text().trim();
            current["uexa"] = $(this).children().eq(30).text().trim();
            current["exdt"] = $(this).children().eq(31).text().trim();
            current["uext"] = $(this).children().eq(32).text().trim();
            report.push(current);
        });
        // Find the first span element with the id containing TotalEarnedCredit and push it to report
        const totalEarnedCredit = $("[id='plnMain_lblTotalEarnedCredit']").text().trim();
        report.push({ totalEarnedCredit: totalEarnedCredit });

        const commentLegendTable = $$('.sg-asp-table[id="plnMain_dgCommentLegend"]');
        let comments = [];

        commentLegendTable.find('tr:not(.sg-asp-table-header-row)').each(function () {
            let commentRow = {};
            commentRow['comment'] = $(this).children().eq(0).text().trim();
            commentRow['commentDescription'] = $(this).children().eq(1).text().trim();
            comments.push(commentRow);
        });
        report.push({ comments: comments });

        reports.push({ reportCardRun: selectedText, report });
    }

    const sessionData = session.defaults.jar.toJSON();
    res.send({
        reportCards: reports,
        session: sessionData,
    });

});

app.get('/transcript', async (req, res) => {
    const loginDetails = verifyLogin(req, res);
    if (!loginDetails) return;
    res = updateRes(res, req);

    const { link, session } = await startSession(req, res, loginDetails);


    if (typeof session == "object") {
        res.status(session.status || 401).send({ "success": false, "message": session.message });
        return;
    }

    const transcriptUrl = link + "HomeAccess/Content/Student/Transcript.aspx";
    const { data: transcriptPage } = await session.get(transcriptUrl);
    const $ = cheerio.load(transcriptPage);

    const transcript = {};

    $('td.sg-transcript-group').each((index, element) => {
        const semester = {};

        // First table
        $(element).find('table > tbody > tr > td > span').each((i, el) => {
            const id = $(el).attr('id');
            if (id.includes('YearValue')) {
                semester['year'] = $(el).text().trim();
            } else if (id.includes('GroupValue')) {
                semester['semester'] = $(el).text().trim();
            } else if (id.includes('GradeValue')) {
                semester['grade'] = $(el).text().trim();
            } else if (id.includes('BuildingValue')) {
                semester['school'] = $(el).text().trim();
            }
        });

        const finalData = [];

        // Second table
        $(element).find('table:nth-child(2) > tbody > tr').each((i, el) => {
            if ($(el).hasClass('sg-asp-table-header-row') || $(el).hasClass('sg-asp-table-data-row')) {
                const data = [];
                $(el).find('td').each((j, el2) => {
                    data.push($(el2).text().trim());
                });
                finalData.push(data);
            }
        });
        semester['data'] = finalData;

        // Third table
        $(element).find('table:nth-child(3) > tbody > tr > td > label').each((i, el) => {
            if ($(el).attr('id').includes('CreditValue')) {
                semester['credits'] = $(el).text().trim();
            }
        });

        const title = `${semester['year']} - Semester ${semester['semester']}`;
        transcript[title] = semester;
    });

    $('#plnMain_rpTranscriptGroup_tblCumGPAInfo tbody > tr.sg-asp-table-data-row').each((index, element) => {
        let text = '';
        let value = '';
        $(element).find('td > span').each((i, el) => {
            const id = $(el).attr('id');
            if (id.includes('GPADescr')) {
                text = $(el).text().trim();
            }
            if (id.includes('GPACum')) {
                value = $(el).text().trim();
            }
            if (id.includes('GPARank')) {
                transcript['rank'] = $(el).text().trim();
            }
            if (id.includes('GPAQuartile')) {
                transcript['quartile'] = $(el).text().trim();
            }
        });
        transcript[text] = value;
    });

    const sessionData = session.defaults.jar.toJSON();
    res.send({
        transcriptData: transcript,
        session: sessionData,
    });
});

app.get('/bellSchedule', async (req, res) => {
    res.status(404).send({
        success: false,
        message: "Bell Schedule not found"
    });
});

module.exports = app;