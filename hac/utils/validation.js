import process from 'process';
import { ERROR_MESSAGES } from '../config/constants.js';
import { ValidationError } from '../middleware/errors.js';

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

// Factory functions for form data
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

export {
    splitClassHeaderAndCourseName,
    formatLink,
    validateLoginParameters,
    isTestCredentials,
    getProductionCredentials,
    createLoginData,
    createTermData,
    createMonthData
};
