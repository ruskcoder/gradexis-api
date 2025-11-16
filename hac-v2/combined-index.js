const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { loginClassLink } = require('../auth/classlink');
let process;
const app = express();
app.use(express.json());

const HTTP_STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502
};

const ERROR_MESSAGES = {
    INVALID_SESSION: "Welcome to",
    INVALID_CREDENTIALS: "incorrect",
    INVALID_CREDENTIALS_ALT: "invalid",
    DISTRICT_NOT_FOUND: "District not Found",
    INVALID_USERNAME_PASSWORD: "Invalid username or password",
    MISSING_PARAMETERS: "Missing one or more required parameters",
    INVALID_MONTH: "Invalid month name",
    BELL_SCHEDULE_NOT_FOUND: "Bell Schedule not found"
};

const HAC_ENDPOINTS = {
    LOGIN: 'HomeAccess/Account/LogOn',
    REGISTRATION: 'HomeAccess/Content/Student/Registration.aspx',
    ASSIGNMENTS: 'HomeAccess/Content/Student/Assignments.aspx',
    CLASSES: 'HomeAccess/Content/Student/Classes.aspx',
    ATTENDANCE: 'HomeAccess/Content/Attendance/MonthlyView.aspx',
    INTERIM_PROGRESS: 'HomeAccess/Content/Student/InterimProgress.aspx',
    REPORT_CARDS: 'HomeAccess/Content/Student/ReportCards.aspx',
    TRANSCRIPT: 'HomeAccess/Content/Student/Transcript.aspx'
};

class APIError extends Error {
    constructor(message, status = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
        super(message);
        this.status = status;
        this.name = 'APIError';
    }
}

class AuthenticationError extends APIError {
    constructor(message) {
        super(message, HTTP_STATUS.UNAUTHORIZED);
        this.name = 'AuthenticationError';
    }
}

class ValidationError extends APIError {
    constructor(message) {
        super(message, HTTP_STATUS.BAD_REQUEST);
        this.name = 'ValidationError';
    }
}

class ProgressTracker {
    constructor(res, streaming = false) {
        this.res = res;
        this.streaming = streaming;
    }

    update(percent, message) {
        if (this.streaming) {
            this.res.write(JSON.stringify({ percent, message }) + '\n\n');
        }
    }

    complete(data) {
        if (this.streaming) {
            this.res.end(JSON.stringify(data));
        } else {
            this.res.json(data);
        }
    }
}

function sendError(res, error) {
    const status = error.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ success: false, message });
}

function createSuccessResponse(data, session = null) {
    const response = { success: true, ...data };
    if (session) {
        response.session = session.defaults.jar.toJSON();
    }
    return response;
}

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
        if (!res.headersSent) {
            sendError(res, err);
        }
    });
};

const _get = app.get.bind(app);
app.get = (path, ...handlers) => _get(path, ...handlers.map(h => asyncHandler(h)));

const MONTH_INPUTS = {
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
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function createLoginData(username = '', password = '', token = '') {
    return {
        "__RequestVerificationToken": token,
        "SCKTY00328510CustomEnabled": true,
        "SCKTY00436568CustomEnabled": true,
        "Database": 10,
        "VerificationOption": "UsernamePassword",
        "LogOnDetails.UserName": username,
        "tempUN": "",
        "tempPW": "",
        "LogOnDetails.Password": password,
    };
}

function createTermData(reportCardRun = '') {
    return {
        "__EVENTTARGET": "ctl00$plnMain$btnRefreshView",
        "__EVENTARGUMENT": "",
        "__LASTFOCUS": "",
        "__VIEWSTATEGENERATOR": "B0093F3C",
        "ctl00$plnMain$ddlReportCardRuns": reportCardRun,
    };
}

function createMonthData(viewState = '', eventValidation = '', eventArgument = '') {
    return {
        "__EVENTTARGET": "ctl00$plnMain$cldAttendance",
        "__EVENTARGUMENT": eventArgument,
        "__VIEWSTATE": viewState,
        "__VIEWSTATEGENERATOR": "C0F72E2D",
        "__EVENTVALIDATION": eventValidation,
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
    };
}

const DEFAULT_HEADERS = {
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
};

function createSession() {
    const jar = new CookieJar();
    const session = wrapper(axios.create({
        withCredentials: true,
        jar,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }));
    return session;
}

function splitClassHeaderAndCourseName(classText) {
    const parts = classText.split(' ');
    const classHeader = parts.slice(0, 3).join(' ');
    const courseName = parts.slice(3).join(' ');
    return { classHeader, courseName };
}

function formatLink(link) {
    if (!link) return undefined;

    link = link.trim();
    link = link.endsWith('/') ? link.slice(0, -1) : link;
    link = link.endsWith("/HomeAccess") ? link.slice(0, -11) : link;
    link = link + "/";
    link = link.startsWith('http') ? link : 'https://' + link;

    return link;
}

function validateLoginParameters(req) {
    const hasCredentials = req.query.username && req.query.password;
    const hasClassLink = req.query.clsession;
    const hasLink = req.query.link || req.query.clsession;

    if ((!hasCredentials && !hasClassLink) || !hasLink) {
        throw new ValidationError(ERROR_MESSAGES.MISSING_PARAMETERS);
    }

    return {
        link: formatLink(req.query.link),
        username: req.query.username,
        password: req.query.password
    };
}

function isTestCredentials(username, password) {
    return username === process.env.TESTUSER && password === process.env.TESTPSSWD;
}

function getProductionCredentials() {
    return {
        username: process.env.USERNAME,
        password: process.env.PASSWORD
    };
}

function checkSessionValidity(response) {
    if (response.data.includes(ERROR_MESSAGES.INVALID_SESSION)) {
        throw new AuthenticationError("Invalid Session");
    }
}

async function authenticateWithCredentials(session, username, password, link, district) {

    if (isTestCredentials(username, password)) {
        const prodCreds = getProductionCredentials();
        username = prodCreds.username;
        password = prodCreds.password;
    }

    const loginUrl = `${link}${HAC_ENDPOINTS.LOGIN}`;
    const loginData = createLoginData(username, password);

    try {

        const { data: loginResponse } = await session.get(loginUrl);
        const $ = cheerio.load(loginResponse);
        loginData["__RequestVerificationToken"] = $("input[name='__RequestVerificationToken']").val();

        if (district) {
            const select = $('select.valid');
            let found = false;

            select.find('option').each(function () {
                const optionText = $(this).text().toLowerCase();
                if (optionText.includes(district.toLowerCase())) {
                    loginData.Database = $(this).attr('value');
                    found = true;
                    return false; // break loop
                }
            });

            if (!found) {
                throw new AuthenticationError(ERROR_MESSAGES.DISTRICT_NOT_FOUND);
            }
        }

        const loginResult = await session.post(loginUrl, loginData);

        if (loginResult.data.includes(ERROR_MESSAGES.INVALID_CREDENTIALS) ||
            loginResult.data.includes(ERROR_MESSAGES.INVALID_CREDENTIALS_ALT)) {
            throw new AuthenticationError(ERROR_MESSAGES.INVALID_USERNAME_PASSWORD);
        }

        session.hacData = loginResult.data;
        return { session, username };

    } catch (error) {
        if (error instanceof AuthenticationError) {
            throw error;
        }
        throw new APIError(`Login failed: ${error.message}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

async function authenticateWithClassLink(session, clsession, progressTracker) {
    try {
        progressTracker.update(34, 'Fetching HAC URL');

        const { link: hacLink, session: loggedInSession, exchangeCode } = await loginClassLink(session, clsession, "hac");

        if (!hacLink) {
            throw new AuthenticationError("ClassLink authentication failed");
        }

        session = loggedInSession;
        progressTracker.update(46, 'Logging into HAC');

        const hacResponse = await session.get(hacLink);
        const urlObj = new URL(hacLink);
        let link = urlObj.origin + '/';
        const username = exchangeCode.data.user.loginId;
        let hacSplash = hacResponse.data;

        if (exchangeCode.data.user.tenantName.includes("Conroe ISD")) {
            const gwsToken = hacLink.split("GWSToken=")[1];
            await session.get(hacLink);
            await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=isapps.conroeisd.net&p=443&s=513&l=802&gwsToken=${gwsToken}`);
            await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=paclite.conroeisd.net&p=443&s=514&l=803&gwsToken=${gwsToken}`);
            await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=cisdnet.conroeisd.net&p=443&s=517&l=806&gwsToken=${gwsToken}`);

            const conroeResponse = await session.get('https://hac.conroeisd.net/HomeAccess/District/Student/ConroeISD');
            hacSplash = conroeResponse.data;
            link = 'https://hac.conroeisd.net/';
        }

        session.hacData = hacSplash;
        return { session, username, link };

    } catch (error) {
        if (error instanceof AuthenticationError) {
            throw error;
        }
        throw new APIError(`ClassLink authentication failed: ${error.message}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

async function authenticateUser(req, progressTracker) {
    const loginDetails = validateLoginParameters(req);
    let { link, username, password } = loginDetails;

    let session = createSession();

    if (req.query.session) {
        try {
            const cookies = JSON.parse(req.query.session);
            session.defaults.jar = CookieJar.fromJSON(cookies);

            if (!link) {
                const authCookie = cookies.cookies.find(cookie => cookie.key === '.AuthCookie');
                link = formatLink(authCookie?.domain);
            }

            return { session, link, username };
        } catch (error) {
            throw new ValidationError("Invalid session data");
        }
    }

    if (req.query.clsession) {
        const result = await authenticateWithClassLink(session, req.query.clsession, progressTracker);
        return {
            session: result.session,
            link: result.link,
            username: result.username
        };
    } else {
        const result = await authenticateWithCredentials(session, username, password, link, req.query.district);
        return {
            session: result.session,
            link,
            username: result.username
        };
    }
}

app.get('/', (req, res) => {
    res.json({ message: "HAC API", success: true });
});

app.get('/login', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");

    const authResult = await authenticateUser(req, progressTracker);
    const { link, session } = authResult;

    const registration = await session.get(link + HAC_ENDPOINTS.REGISTRATION);
    checkSessionValidity(registration);

    const response = createSuccessResponse({}, session);
    progressTracker.complete(response);
});

app.get('/info', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");

    const { link, session, username } = await authenticateUser(req, progressTracker);

    const $$ = cheerio.load(session.hacData);
    const registration = await session.get(link + HAC_ENDPOINTS.REGISTRATION);
    checkSessionValidity(registration);

    const $ = cheerio.load(registration.data);

    let studentInfo = {};

    if ($("span#plnMain_lblRegStudentName").length) {
        studentInfo = {
            name: $("span#plnMain_lblRegStudentName").text().trim(),
            grade: $("span#plnMain_lblGrade").text().trim(),
            school: $("span#plnMain_lblBuildingName").text().trim(),
            dob: $("span#plnMain_lblBirthDate").text().trim(),
            counselor: $("span#plnMain_lblCounselor").text().trim(),
            language: $("span#plnMain_lblLanguage").text().trim(),
            cohortYear: $("span#plnMain_lblCohortYear").text().trim(),
            district: $$("span.sg-banner-text").text().trim(),
        };

        if (studentInfo.name === process.env.MYNAME) {
            studentInfo.name = "Test User";
        }
    }

    const response = createSuccessResponse({
        username,
        link,
        ...studentInfo
    }, session);

    progressTracker.complete(response);
});

async function fetchClassesData(session, link, term, progressTracker) {
    progressTracker.update(50, 'Fetching classes');

    const scoresResponse = await session.get(link + HAC_ENDPOINTS.ASSIGNMENTS);
    checkSessionValidity(scoresResponse);

    let $ = cheerio.load(scoresResponse.data);

    if (term) {
        progressTracker.update(70, 'Going to term');

        const viewstate = $('input[name="__VIEWSTATE"]').val();
        const eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
        const year = $('select[name="ctl00$plnMain$ddlReportCardRuns"] option').eq(1).val().substring(2);

        const termData = createTermData(`${term}-${year}`);
        termData["__VIEWSTATE"] = viewstate;
        termData["__EVENTVALIDATION"] = eventvalidation;

        const termResponse = await session.post(link + HAC_ENDPOINTS.ASSIGNMENTS, termData);
        $ = cheerio.load(termResponse.data);
    }

    progressTracker.update(83, 'Crunching data');

    const scheduleResponse = await session.get(link + HAC_ENDPOINTS.CLASSES);
    const $$ = cheerio.load(scheduleResponse.data);

    return { assignmentsPage: $, schedulePage: $$ };
}

function extractClassList(assignmentsPage) {
    const classes = [];
    assignmentsPage('.AssignmentClass .sg-header .sg-header-heading:not(.sg-right)').each(function () {
        classes.push(assignmentsPage(this).text().trim());
    });

    return classes.map(c => {
        const { classHeader } = splitClassHeaderAndCourseName(c);
        return classHeader.trim();
    });
}

function extractTermInfo(assignmentsPage) {
    const term = assignmentsPage('#plnMain_ddlReportCardRuns').find('option[selected="selected"]').text().trim();
    const termList = assignmentsPage('#plnMain_ddlReportCardRuns').find('option')
        .toArray()
        .map(e => assignmentsPage(e).text().trim())
        .slice(1);

    return { term, termList };
}

function extractScheduleData(schedulePage, courses) {
    const scheduleData = {};

    schedulePage('.sg-asp-table-data-row').each(function () {
        const courseText = schedulePage(this).children().first().text().trim();

        if (courses.includes(courseText)) {
            scheduleData[courseText] = {
                averageType: "categorywise",
                course: courseText,
                name: schedulePage(this).children().eq(1).find('a').text().trim(),
                period: schedulePage(this).children().eq(2).text().trim().substring(0, 1),
                teacher: schedulePage(this).children().eq(3).text().trim(),
                room: schedulePage(this).children().eq(4).text().trim(),
            };
        }
    });

    return scheduleData;
}

function extractAssignmentData(assignmentsPage, scheduleData) {
    assignmentsPage('.AssignmentClass').each(function () {
        const classHeader = splitClassHeaderAndCourseName(
            assignmentsPage(this).find('.sg-header .sg-header-heading').text().trim()
        ).classHeader.trim();

        if (!scheduleData[classHeader]) {
            scheduleData[classHeader] = {
                course: classHeader,
                name: splitClassHeaderAndCourseName(
                    assignmentsPage(this).find('.sg-header .sg-header-heading').eq(0).text().trim()
                ).courseName.trim(),
                period: "dropped",
            };
        }

        const averageText = assignmentsPage(this).find('.sg-header .sg-header-heading.sg-right').text().trim().split(' ').pop();
        scheduleData[classHeader].average = averageText.endsWith("%") ?
            averageText.slice(0, -1) : averageText;

        scheduleData[classHeader].scores = [];
        assignmentsPage(this).find('.sg-content-grid > .sg-asp-table > tbody > .sg-asp-table-data-row').each(function () {
            const assignment = {
                name: assignmentsPage(this).children().eq(2).children().first().text().trim(),
                category: assignmentsPage(this).children().eq(3).text().trim(),
                percentage: assignmentsPage(this).children().eq(9).text().trim(),
                score: assignmentsPage(this).children().eq(4).text().trim(),
                totalPoints: parseFloat(assignmentsPage(this).children().eq(5).text().trim()) || "",
                weight: parseFloat(assignmentsPage(this).children().eq(6).text().trim()) || "",
                weightedScore: parseFloat(assignmentsPage(this).children().eq(7).text().trim()) || "",
                weightedTotalPoints: parseFloat(assignmentsPage(this).children().eq(8).text().trim()) || "",
                dateDue: assignmentsPage(this).children().eq(0).text().trim(),
                dateAssigned: assignmentsPage(this).children().eq(1).text().trim(),
                badges: []
            };

            if (assignment.score && assignment.score.includes('Missing')) {
                assignment.badges.push("missing");
                assignment.score = 0;
            }
            if (assignment.score && assignment.score.includes('Exempt')) {
                assignment.badges.push("exempt");
                assignment.score = "";
            }

            assignment.score = parseFloat(assignment.score) || assignment.score;
            scheduleData[classHeader].scores.push(assignment);
        });

        scheduleData[classHeader].categories = {};
        assignmentsPage(this).find('.sg-content-grid .sg-asp-table-group tr.sg-asp-table-data-row').each(function () {
            const categoryName = assignmentsPage(this).children().eq(0).text().trim();
            scheduleData[classHeader].categories[categoryName] = {
                studentsPoints: assignmentsPage(this).children().eq(1).text().trim(),
                maximumPoints: assignmentsPage(this).children().eq(2).text().trim(),
                percent: assignmentsPage(this).children().eq(3).text().trim(),
                categoryWeight: assignmentsPage(this).children().eq(4).text().trim(),
                categoryPoints: assignmentsPage(this).children().eq(5).text().trim(),
            };
        });
    });

    return scheduleData;
}

app.get('/classes', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");

    progressTracker.update(0, 'Logging In');
    const { link, session } = await authenticateUser(req, progressTracker);

    const { assignmentsPage, schedulePage } = await fetchClassesData(session, link, req.query.term, progressTracker);

    const courses = extractClassList(assignmentsPage);
    const { term, termList } = extractTermInfo(assignmentsPage);

    let scheduleData = extractScheduleData(schedulePage, courses);
    scheduleData = extractAssignmentData(assignmentsPage, scheduleData);

    const classes = Object.values(scheduleData);

    const response = createSuccessResponse({
        scoresIncluded: true,
        termList,
        term,
        classes
    }, session);

    progressTracker.complete(response);
});

app.get('/grades', async (req, res) => {
    if (!req.query.class) {
        throw new ValidationError("Missing required parameters (class)");
    }

    const { data: classesData } = await axios.get(`${req.protocol}://${req.get('host')}/hac/classes`, {
        params: req.query
    });

    const currentClass = classesData.classes.find(c => c.name === req.query.class);
    if (!currentClass) {
        throw new ValidationError("Class not found");
    }

    const response = createSuccessResponse({
        term: classesData.term,
        ...currentClass
    });

    response.session = classesData.session;
    res.json(response);
});

app.get('/schedule', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    const { link, session } = await authenticateUser(req, progressTracker);

    const scheduleResponse = await session.get(link + HAC_ENDPOINTS.CLASSES);
    checkSessionValidity(scheduleResponse);

    const $ = cheerio.load(scheduleResponse.data);

    const columns = [];
    $('.sg-asp-table-header-row').children().each(function () {
        columns.push($(this).text().trim());
    });

    const schedule = [];
    $('.sg-asp-table-data-row').each(function () {
        const row = {};
        $(this).children().each(function (i) {
            row[columns[i]] = $(this).text().trim();
        });
        schedule.push(row);
    });

    const response = createSuccessResponse({ schedule }, session);
    progressTracker.complete(response);
});

function processAttendanceDate(dateQuery) {
    if (!dateQuery) return null;

    const [reqMonth, reqYear] = dateQuery.split('-');
    const monthIndex = MONTH_INPUTS[reqMonth.toLowerCase()];

    if (monthIndex === undefined) {
        throw new ValidationError(ERROR_MESSAGES.INVALID_MONTH);
    }

    return { monthIndex, reqYear: parseInt(reqYear) };
}

function calculateMonthCode(year, monthIndex) {
    const jan1 = new Date(2000, 0, 1);
    const targetDate = new Date(year, monthIndex, 1);
    return Math.floor((targetDate - jan1) / 86400000);
}

async function navigateToMonth(session, link, targetMonthCode, progressTracker) {
    const maxLoops = 15;
    let loops = 0;

    let currentPage = await session.get(link + HAC_ENDPOINTS.ATTENDANCE);
    let $ = cheerio.load(currentPage.data);

    while (loops < maxLoops) {
        loops++;

        const prevElement = $('a[title="Go to the previous month"]');
        const nextElement = $('a[title="Go to the next month"]');

        let prev, next;

        if (!nextElement.text()) {
            prev = parseInt(prevElement.attr('href').split('\'')[3].slice(1));
            if (targetMonthCode > prev) return $; // Month not available
        } else if (!prevElement.text()) {
            next = parseInt(nextElement.attr('href').split('\'')[3].slice(1));
            if (targetMonthCode < next) return $; // Month not available
        } else {
            prev = parseInt(prevElement.attr('href').split('\'')[3].slice(1));
            next = parseInt(nextElement.attr('href').split('\'')[3].slice(1));
        }

        const monthData = createMonthData(
            $('input[name="__VIEWSTATE"]').val(),
            $('input[name="__EVENTVALIDATION"]').val()
        );

        if (targetMonthCode <= prev) {
            monthData['__EVENTARGUMENT'] = `V${prev}`;
        } else if (targetMonthCode >= next) {
            monthData['__EVENTARGUMENT'] = `V${next}`;
        } else {
            break; // We're at the right month
        }

        const response = await session.post(link + HAC_ENDPOINTS.ATTENDANCE, monthData);
        $ = cheerio.load(response.data);
    }

    return $;
}

function extractAttendanceData($) {
    const events = {};
    const colorKey = {};

    $('.sg-clearfix div').each(function () {
        const styleAttr = $(this).children().eq(0).attr('style');
        if (styleAttr) {
            const color = styleAttr.substring(18).split(';')[0].toLowerCase();
            colorKey[color] = $(this).children().eq(1).text();
        }
    });

    const monthDisplay = $('#plnMain_cldAttendance > tbody > tr:nth-child(1) > td > table > tbody > tr > td:nth-child(2)').text().trim();

    $('.sg-asp-calendar tr').slice(2).find('td').each(function (index) {
        if (![0, 6].includes(index % 7)) { // Skip weekends
            const dateText = $(this).text() + " " + monthDisplay;
            const dateParts = dateText.split(' ');
            const month = new Date(dateParts[1] + ' 1, 2000').getMonth() + 1;
            const formattedDate = `${month}/${dateParts[0]}/${dateParts[2].slice(-2)}`;

            if ($(this).attr('title')) {
                events[formattedDate] = {
                    event: $(this).attr('title').split('\n')[1],
                    color: $(this).attr('bgcolor').toLowerCase()
                };
            } else if ($(this).attr('style')) {
                const color = $(this).attr('style').substring(17).split(';')[0].toLowerCase();
                if (colorKey[color]) {
                    events[formattedDate] = {
                        event: colorKey[color],
                        color: color
                    };
                }
            }
        }
    });

    return {
        month: monthDisplay.split(' ')[0],
        year: monthDisplay.split(' ')[1],
        events
    };
}

app.get('/attendance', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    const { link, session } = await authenticateUser(req, progressTracker);

    let dateInfo = null;
    if (req.query.date) {
        dateInfo = processAttendanceDate(req.query.date);
    }

    const attendanceResponse = await session.get(link + HAC_ENDPOINTS.ATTENDANCE);
    checkSessionValidity(attendanceResponse);

    let $ = cheerio.load(attendanceResponse.data);

    if (dateInfo) {
        const targetMonthCode = calculateMonthCode(dateInfo.reqYear, dateInfo.monthIndex);

        if (!attendanceResponse.data.includes(MONTH_NAMES[dateInfo.monthIndex])) {
            $ = await navigateToMonth(session, link, targetMonthCode, progressTracker);
        }
    }

    const attendanceData = extractAttendanceData($);
    const response = createSuccessResponse(attendanceData, session);
    progressTracker.complete(response);
});

app.get('/teachers', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    const { link, session } = await authenticateUser(req, progressTracker);

    const classesResponse = await session.get(link + HAC_ENDPOINTS.CLASSES);
    checkSessionValidity(classesResponse);

    const $ = cheerio.load(classesResponse.data);

    const teachers = [];
    $('.sg-asp-table-data-row').each(function () {
        const teacherInfo = $(this).children().eq(3).find('a');
        teachers.push({
            class: $(this).children().eq(1).text().trim(),
            teacher: teacherInfo.text().trim(),
            email: String(teacherInfo.attr('href')).replace('mailto:', '').trim()
        });
    });

    const response = createSuccessResponse({ teachers }, session);
    progressTracker.complete(response);
});

async function extractProgressReports(session, progressReportUrl, $) {
    const options = $('#plnMain_ddlIPRDates option').toArray().reverse();
    const reports = [];

    for (const option of options) {
        const value = $(option).attr('value');
        const selectedText = $(option).text().trim();

        const formData = {
            __EVENTTARGET: 'ctl00$plnMain$ddlIPRDates',
            __EVENTARGUMENT: '',
            __VIEWSTATE: $('input[name="__VIEWSTATE"]').val(),
            __EVENTVALIDATION: $('input[name="__EVENTVALIDATION"]').val(),
            'ctl00$plnMain$ddlIPRDates': value,
        };

        const { data: updatedPage } = await session.post(progressReportUrl, formData);
        const $$ = cheerio.load(updatedPage);

        const report = [];

        $$('#plnMain_dgIPR .sg-asp-table-data-row').each(function () {
            const courseData = {
                course: $$(this).children().eq(0).text().trim(),
                description: $$(this).children().eq(1).text().trim(),
                period: $$(this).children().eq(2).text().trim(),
                teacher: $$(this).children().eq(3).text().trim(),
                room: $$(this).children().eq(4).text().trim(),
                grade: $$(this).children().eq(5).text().trim(),
                com1: $$(this).children().eq(6).text().trim(),
                com2: $$(this).children().eq(7).text().trim(),
                com3: $$(this).children().eq(8).text().trim(),
                com4: $$(this).children().eq(9).text().trim(),
                com5: $$(this).children().eq(10).text().trim(),
            };
            report.push(courseData);
        });

        const comments = [];
        $$('.sg-asp-table[id*="CommentLegend"] tr.sg-asp-table-data-row').each(function () {
            comments.push({
                comment: $$(this).children().eq(0).text().trim(),
                commentDescription: $$(this).children().eq(1).text().trim(),
            });
        });

        report.push({ comments });
        reports.push({ date: selectedText, report });
    }

    return reports;
}

async function extractReportCards(session, reportCardUrl, $) {
    const options = $('#plnMain_ddlRCRuns option').toArray().reverse();
    let reload = options.length > 0;

    if (!reload) {
        options.push(""); // Handle case with no options
    }

    const reports = [];

    for (const option of options) {
        let selectedText, $$;

        if (reload) {
            const value = $(option).attr('value');
            selectedText = $(option).text().trim();

            const formData = {
                __EVENTTARGET: 'ctl00$plnMain$ddlRCRuns',
                __EVENTARGUMENT: '',
                __VIEWSTATE: $('input[name="__VIEWSTATE"]').val(),
                __EVENTVALIDATION: $('input[name="__EVENTVALIDATION"]').val(),
                'ctl00$plnMain$ddlRCRuns': value,
            };

            const { data: updatedPage } = await session.post(reportCardUrl, formData);
            $$ = cheerio.load(updatedPage);
        } else {
            selectedText = "1";
            $$ = $;
        }

        const report = [];

        $$('.sg-asp-table-data-row').each(function () {
            const courseData = {
                course: $$(this).children().eq(0).text().trim(),
                description: $$(this).children().eq(1).text().trim(),
                period: $$(this).children().eq(2).text().trim(),
                teacher: $$(this).children().eq(3).text().trim(),
                room: $$(this).children().eq(4).text().trim(),
                att_credit: $$(this).children().eq(5).text().trim(),
                ern_credit: $$(this).children().eq(6).text().trim(),
                first: $$(this).children().eq(7).text().trim(),
                second: $$(this).children().eq(8).text().trim(),
                third: $$(this).children().eq(9).text().trim(),
                exam1: $$(this).children().eq(10).text().trim(),
                sem1: $$(this).children().eq(11).text().trim(),
                fourth: $$(this).children().eq(12).text().trim(),
                fifth: $$(this).children().eq(13).text().trim(),
                sixth: $$(this).children().eq(14).text().trim(),
                exam2: $$(this).children().eq(15).text().trim(),
                sem2: $$(this).children().eq(16).text().trim(),
                eoy: $$(this).children().eq(17).text().trim(),
                cnd1: $$(this).children().eq(18).text().trim(),
                cnd2: $$(this).children().eq(19).text().trim(),
                cnd3: $$(this).children().eq(20).text().trim(),
                cnd4: $$(this).children().eq(21).text().trim(),
                cnd5: $$(this).children().eq(22).text().trim(),
                cnd6: $$(this).children().eq(23).text().trim(),
                c1: $$(this).children().eq(24).text().trim(),
                c2: $$(this).children().eq(25).text().trim(),
                c3: $$(this).children().eq(26).text().trim(),
                c4: $$(this).children().eq(27).text().trim(),
                c5: $$(this).children().eq(28).text().trim(),
                exda: $$(this).children().eq(29).text().trim(),
                uexa: $$(this).children().eq(30).text().trim(),
                exdt: $$(this).children().eq(31).text().trim(),
                uext: $$(this).children().eq(32).text().trim(),
            };
            report.push(courseData);
        });

        const totalEarnedCredit = $$("[id='plnMain_lblTotalEarnedCredit']").text().trim();
        report.push({ totalEarnedCredit });

        const comments = [];
        $$('.sg-asp-table[id="plnMain_dgCommentLegend"] tr:not(.sg-asp-table-header-row)').each(function () {
            comments.push({
                comment: $$(this).children().eq(0).text().trim(),
                commentDescription: $$(this).children().eq(1).text().trim(),
            });
        });

        report.push({ comments });
        reports.push({ reportCardRun: selectedText, report });
    }

    return reports;
}

function extractTranscriptData($) {
    const transcript = {};

    $('td.sg-transcript-group').each((index, element) => {
        const semester = {};

        $(element).find('table > tbody > tr > td > span').each((i, el) => {
            const id = $(el).attr('id');
            if (id.includes('YearValue')) {
                semester.year = $(el).text().trim();
            } else if (id.includes('GroupValue')) {
                semester.semester = $(el).text().trim();
            } else if (id.includes('GradeValue')) {
                semester.grade = $(el).text().trim();
            } else if (id.includes('BuildingValue')) {
                semester.school = $(el).text().trim();
            }
        });

        const courseData = [];
        $(element).find('table:nth-child(2) > tbody > tr').each((i, el) => {
            if ($(el).hasClass('sg-asp-table-header-row') || $(el).hasClass('sg-asp-table-data-row')) {
                const rowData = [];
                $(el).find('td').each((j, cell) => {
                    rowData.push($(cell).text().trim());
                });
                courseData.push(rowData);
            }
        });
        semester.data = courseData;

        $(element).find('table:nth-child(3) > tbody > tr > td > label').each((i, el) => {
            if ($(el).attr('id').includes('CreditValue')) {
                semester.credits = $(el).text().trim();
            }
        });

        const title = `${semester.year} - Semester ${semester.semester}`;
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
                transcript.rank = $(el).text().trim();
            }
            if (id.includes('GPAQuartile')) {
                transcript.quartile = $(el).text().trim();
            }
        });

        if (text) {
            transcript[text] = value;
        }
    });

    return transcript;
}

app.get('/ipr', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    const { link, session } = await authenticateUser(req, progressTracker);

    const progressReportUrl = link + HAC_ENDPOINTS.INTERIM_PROGRESS;
    const { data: progressReportPage } = await session.get(progressReportUrl);
    checkSessionValidity({ data: progressReportPage });

    const $ = cheerio.load(progressReportPage);
    const progressReports = await extractProgressReports(session, progressReportUrl, $);

    const response = createSuccessResponse({ progressReports }, session);
    progressTracker.complete(response);
});

app.get('/reportCard', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    const { link, session } = await authenticateUser(req, progressTracker);

    const reportCardUrl = link + HAC_ENDPOINTS.REPORT_CARDS;
    const { data: reportCardPage } = await session.get(reportCardUrl);
    checkSessionValidity({ data: reportCardPage });

    const $ = cheerio.load(reportCardPage);
    const reportCards = await extractReportCards(session, reportCardUrl, $);

    const response = createSuccessResponse({ reportCards }, session);
    progressTracker.complete(response);
});

app.get('/transcript', async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    const { link, session } = await authenticateUser(req, progressTracker);

    const transcriptUrl = link + HAC_ENDPOINTS.TRANSCRIPT;
    const { data: transcriptPage } = await session.get(transcriptUrl);
    checkSessionValidity({ data: transcriptPage });

    const $ = cheerio.load(transcriptPage);
    const transcriptData = extractTranscriptData($);

    const response = createSuccessResponse({ transcriptData }, session);
    progressTracker.complete(response);
});

app.get('/bellSchedule', async (req, res) => {
    throw new APIError(ERROR_MESSAGES.BELL_SCHEDULE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
});

module.exports = app;

