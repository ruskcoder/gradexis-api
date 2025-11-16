 
const { ERROR_MESSAGES } = require('../config/constants');
const { ValidationError } = require('../middleware/errors');

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
    const { loginType, loginData, session, link, options, username } = req.body;

    if (!loginType || !['credentials', 'classlink'].includes(loginType)) {
        throw new ValidationError("loginType must be 'credentials' or 'classlink'");
    }

    if (session) {
        return {
            loginType,
            link: link || loginData?.link || options?.link,
            username: loginData?.username,
            password: loginData?.password,
            clsession: loginData?.clsession,
            session: session,
            options: options || {}
        };
    }

    if (!loginData) {
        throw new ValidationError("loginData is required");
    }

    if (loginType === 'credentials') {
        if (!loginData.username || !loginData.password) {
            throw new ValidationError("username and password are required for credentials login");
        }
    } else if (loginType === 'classlink') {
        if (!loginData.clsession) {
            throw new ValidationError("clsession is required for classlink login");
        }
    }

    const finalLink = loginData?.link || options?.link || link;
    if (!finalLink && loginType === 'credentials') {
        throw new ValidationError("link is required for credentials login");
    }

    return {
        loginType,
        link: loginType === 'credentials' ? formatLink(finalLink) : undefined,
        username: loginData.username,
        password: loginData.password,
        clsession: loginData.clsession,
        session: session,
        options: options || {}
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

module.exports = {
    splitClassHeaderAndCourseName,
    formatLink,
    validateLoginParameters,
    isTestCredentials,
    getProductionCredentials,
    createLoginData,
    createTermData,
    createMonthData
};

