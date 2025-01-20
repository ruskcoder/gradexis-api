/* eslint-disable no-undef */
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
const port = 4000;

loginData = {
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
classlinkLoginData = {
  "username": "",
  "password": "",
  "os": "Windows",
  "userdn": "",
  "code": "",   // district name
  "Browser": "Chrome",
  "Resolution": "1920x1080"
}
termData = {
  "__EVENTTARGET": "ctl00$plnMain$btnRefreshView",
  "__EVENTARGUMENT": "",
  "__LASTFOCUS": "",
  "__VIEWSTATEGENERATOR": "B0093F3C",
  "ctl00$plnMain$ddlReportCardRuns": "",
}
monthData = {
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
monthHeaders = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "max-age=0",
  "Connection": "keep-alive",
  "Content-Type": "application/x-www-form-urlencoded",
  "Origin": "https://homeaccess.katyisd.org",
  "Referer": "https://homeaccess.katyisd.org/HomeAccess/Content/Attendance/MonthlyView.aspx",
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
  return wrapper(axios.create({
    withCredentials: true,
    jar,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }));
}
function splitClassHeaderAndCourseName(c){
  const parts = c.split(' ');
  const classHeader = parts.slice(0,3).join(' ');
  const courseName = parts.slice(3).join(' ');
  return {classHeader, courseName};
}
async function loginSession(session, loginData, link) {
  let clLoginData = { ...classlinkLoginData }
  clLoginData.username = loginData['LogOnDetails.Username']
  clLoginData.username = loginData['LogOnDetails.Password']
  clLoginData.code = "katyisd"
  // WIP

  // if (link.includes("katyisd")) {
  //   let clSession = await session.get('https://launchpad.classlink.com/katyisd')
  //   csrftoken = clSession.data.split('"csrfToken":"')[1].split('"')[0]
  //   clSession = await session.post("https://launchpad.classlink.com/login", {
  //     headers: {
  //     'cookie': clSession.headers['set-cookie'][0],
  //     'csrf-token': csrftoken
  //     },
  //     data: classlinkLoginData,
  //     cookies: clSession.headers['set-cookie']
  //   });
  //   // let loginResponse = clSession.json()
  //   // if (loginResponse['ResultCode'] != 1) {
  //   //   return { status: 401, message: loginResponse['ResultDescription'] };
  //   // }
  //   // clSession = await session.get(loginResponse['login_url'])
  //   // clSession = await session.get(`https://myapps.classlink.com/oauth/?code={loginResponse["login_url"].split('redirect_uri=')[1].split('&')[0]}6&response_type=code`)
  // }
  
  if (loginData['LogOnDetails.UserName'] == process.env.TESTUSER && loginData['LogOnDetails.Password'] == process.env.TESTPSSWD ) {
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
      return { status: 401, message: "Incorrect username or password" };
    }
    return session;
  }
  catch (e) {
    return { status: 500, message: "HAC is broken again" };
  }
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
  if (!req.query.link || !req.query.username || !req.query.password) {
    res.status(400).send({ "success": false, "message": `Missing required parameters (link, username, password)` });
    return false;
  }
  else {
    return { link: formatLink(req.query.link), username: req.query.username, password: req.query.password };
  }
}

app.get('/', (req, res) => {
  res.send("HAC API")
});

app.get('/login', async (req, res) => {
  const loginDetails = verifyLogin(req, res);
  if (!loginDetails) return;

  const { link, username, password } = loginDetails;

  let userLoginData = { ...loginData };
  userLoginData['LogOnDetails.UserName'] = username;
  userLoginData['LogOnDetails.Password'] = password;

  let session = createSession();

  session = await loginSession(session, userLoginData, link);
  if (typeof session == "object") {
    res.status(session.status || 401).send({ "success": false, "message": session.message });
    return
  }
  const sessionData = session.defaults.jar.toJSON();
  res.send({
    session: sessionData
  });
  return;
})

app.get('/info', async (req, res) => {
  const loginDetails = verifyLogin(req, res);
  if (!loginDetails) return;

  const { link, username, password } = loginDetails;

  let userLoginData = { ...loginData };
  userLoginData['LogOnDetails.UserName'] = username;
  userLoginData['LogOnDetails.Password'] = password;

  let session = createSession();

  if (req.query.session) {
    const cookies = JSON.parse(req.query.session);
    session.defaults.jar = CookieJar.fromJSON(cookies);
  }
  else {
    session = await loginSession(session, userLoginData, link);
  }

  if (typeof session == "object") {
    res.status(session.status || 401).send({ "success": false, "message": session.message });
    return
  }
  const registration = await session.get(link + "HomeAccess/Content/Student/Registration.aspx");
  if (registration.data.includes("Welcome to")) { res.status(session.status || 401).send({ "success": false, "message": session.message }); return; }
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
    session: sessionData,
  });
  return;
});

app.get('/allGrades', async (req, res) => {
  const loginDetails = verifyLogin(req, res);
  if (!loginDetails) return;

  const { link, username, password } = loginDetails;

  let userLoginData = { ...loginData };
  userLoginData['LogOnDetails.UserName'] = username;
  userLoginData['LogOnDetails.Password'] = password;

  let session = createSession();

  if (req.query.session) {
    const cookies = JSON.parse(req.query.session);
    session.defaults.jar = CookieJar.fromJSON(cookies);
  }
  else {
    session = await loginSession(session, userLoginData, link);
  }
  if (typeof session == "object") {
    res.status(session.status || 401).send({ "success": false, "message": session.message });
    return
  }

  var scores = await session.get(link + "HomeAccess/Content/Student/Assignments.aspx");
  if (scores.data.includes("Welcome to")) { res.status(401).send({ "success": false, "message": "Invalid Session" }); return; }

  var $ = cheerio.load(scores.data);
  if (req.query.term) {
    let newTerm = { ...termData };
    var viewstate = $('input[name="__VIEWSTATE"]').val();
    var eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
    var year = $('select[name="ctl00$plnMain$ddlReportCardRuns"] option').eq(1).val().substring(2);
    newTerm["ctl00$plnMain$ddlReportCardRuns"] = `${req.query.term}-${year}`;
    newTerm["__VIEWSTATE"] = viewstate;
    newTerm["__EVENTVALIDATION"] = eventvalidation;
    scores = await session.post(link + "HomeAccess/Content/Student/Assignments.aspx", newTerm);
    $ = cheerio.load(scores.data);
  }
  const schedule = await session.get(link + "HomeAccess/Content/Student/Classes.aspx");
  const $$ = cheerio.load(schedule.data);

  const classes = [];
  $('.AssignmentClass .sg-header .sg-header-heading:not(.sg-right)').each(function () {
    classes.push($(this).text().trim());
  });
  let term = $('#plnMain_ddlReportCardRuns').find('option[selected="selected"]').text().trim();
  const courses = classes.map(c => {
    const { classHeader, courseName} = splitClassHeaderAndCourseName(c);
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
    ret[classHeader].average = $(this).find('.sg-header .sg-header-heading.sg-right').text().trim().split(' ').pop();
    ret[classHeader].assignments = [];

    $(this).find('.sg-content-grid .sg-asp-table tbody .sg-asp-table-data-row').each(function () {
      const assignment = {
        dateDue: $(this).children().eq(0).text().trim(),
        dateAssigned: $(this).children().eq(1).text().trim(),
        assignment: $(this).children().eq(2).children().first().text().trim(),
        category: $(this).children().eq(3).text().trim(),
        score: $(this).children().eq(4).text().trim(),
        totalPoints: $(this).children().eq(5).text().trim(),
        weight: $(this).children().eq(6).text().trim(),
        weightedScore: $(this).children().eq(7).text().trim(),
        weightedTotalPoints: $(this).children().eq(8).text().trim(),
        percentage: $(this).children().eq(9).text().trim()
      };
      ret[classHeader].assignments.push(assignment);
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
    term: term,
    grades: ret,
    session: sessionData,
  });
  return;
});

app.get('/grades', async (req, res) => {
  const loginDetails = verifyLogin(req, res);
  if (!loginDetails) return;
  if (!req.query.class) {
    res.status(400).send({ "success": false, "message": `Missing required parameters (class)` });
    return;
  }
  const { link, username, password } = loginDetails;

  let userLoginData = { ...loginData };
  userLoginData['LogOnDetails.UserName'] = username;
  userLoginData['LogOnDetails.Password'] = password;

  let session = createSession();

  if (req.query.session) {
    const cookies = JSON.parse(req.query.session);
    session.defaults.jar = CookieJar.fromJSON(cookies);
  }
  else {
    session = await loginSession(session, userLoginData, link);
  }
  if (typeof session == "object") {
    res.status(401).send({ "success": false, "message": "Invalid session" });
    return
  }

  var scores = await session.get(link + "HomeAccess/Content/Student/Assignments.aspx");
  if (scores.data.includes("Welcome to")) { res.status(session.status || 401).send({ "success": false, "message": session.message }); return; }

  var $ = cheerio.load(scores.data);
  if (req.query.term) {
    let newTerm = { ...termData };
    var viewstate = $('input[name="__VIEWSTATE"]').val();
    var eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
    var year = $('select[name="ctl00$plnMain$ddlReportCardRuns"] option').eq(1).val().substring(2);
    newTerm["ctl00$plnMain$ddlReportCardRuns"] = `${req.query.term}-${year}`;
    newTerm["__VIEWSTATE"] = viewstate;
    newTerm["__EVENTVALIDATION"] = eventvalidation;
    scores = await session.post(link + "HomeAccess/Content/Student/Assignments.aspx", newTerm);
    $ = cheerio.load(scores.data);
  }
  if (!$('.AssignmentClass .sg-header .sg-header-heading:not(.sg-right)').toArray().map(e => $(e).text().trim()).map(e => {
    const {classHeader, courseName} = splitClassHeaderAndCourseName(e);
    return courseName.trim();
  }).includes(req.query.class)) {
    res.status(400).send({ "success": false, "message": `Class not found` });
    return;
  }
  const schedule = await session.get(link + "HomeAccess/Content/Student/Classes.aspx");
  const $$ = cheerio.load(schedule.data);

  const classes = [];
  $('.AssignmentClass .sg-header .sg-header-heading:not(.sg-right)').each(function () {
    classes.push($(this).text().trim());
  });

  let term = $('#plnMain_ddlReportCardRuns').find('option[selected="selected"]').text().trim();
  const courses = classes.map(c => {
    const {classHeader, courseName} = splitClassHeaderAndCourseName(c);
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
    ret[classHeader].average = $(this).find('.sg-header .sg-header-heading.sg-right').text().trim().split(' ').pop();
    ret[classHeader].assignments = [];

    $(this).find('.sg-content-grid > .sg-asp-table > tbody > .sg-asp-table-data-row').each(function () {
      const assignment = {
        dateDue: $(this).children().eq(0).text().trim(),
        dateAssigned: $(this).children().eq(1).text().trim(),
        assignment: $(this).children().eq(2).children().first().text().trim(),
        category: $(this).children().eq(3).text().trim(),
        score: $(this).children().eq(4).text().trim(),
        totalPoints: $(this).children().eq(5).text().trim(),
        weight: $(this).children().eq(6).text().trim(),
        weightedScore: $(this).children().eq(7).text().trim(),
        weightedTotalPoints: $(this).children().eq(8).text().trim(),
        percentage: $(this).children().eq(9).text().trim()
      };
      ret[classHeader].assignments.push(assignment);
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
  ret = ret.find(c => c.name === req.query.class);
  const sessionData = session.defaults.jar.toJSON()
  res.send({
    term: term,
    ...ret,
    session: sessionData,
  });
});

app.get('/classes', async (req, res) => {
  const loginDetails = verifyLogin(req, res);
  if (!loginDetails) return;

  const { link, username, password } = loginDetails;

  let userLoginData = { ...loginData };
  userLoginData['LogOnDetails.UserName'] = username;
  userLoginData['LogOnDetails.Password'] = password;

  let session = createSession();

  if (req.query.session) {
    const cookies = JSON.parse(req.query.session);
    session.defaults.jar = CookieJar.fromJSON(cookies);
  }
  else {
    session = await loginSession(session, userLoginData, link);
  }
  if (typeof session == "object") {
    res.status(session.status || 401).send({ "success": false, "message": session.message });
    return
  }

  const averages = await session.get(link + "HomeAccess/Content/Student/Assignments.aspx");
  if (averages.data.includes("Welcome to")) { res.status(401).send({ "success": false, "message": "Invalid Session" }); return; }

  const schedule = await session.get(link + "HomeAccess/Content/Student/Classes.aspx");

  var $ = cheerio.load(averages.data);
  if (req.query.term) {
    let newTerm = { ...termData };
    var viewstate = $('input[name="__VIEWSTATE"]').val();
    var eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
    var year = $('select[name="ctl00$plnMain$ddlReportCardRuns"] option').eq(1).val().substring(2);
    newTerm["ctl00$plnMain$ddlReportCardRuns"] = `${req.query.term}-${year}`;
    newTerm["__VIEWSTATE"] = viewstate;
    newTerm["__EVENTVALIDATION"] = eventvalidation;
    scores = await session.post(link + "HomeAccess/Content/Student/Assignments.aspx", newTerm);
    $ = cheerio.load(scores.data);
  }
  const $$ = cheerio.load(schedule.data);
  let term = $('#plnMain_ddlReportCardRuns').find('option[selected="selected"]').text().trim();
  let termList = $('#plnMain_ddlReportCardRuns').find('option').toArray().map(e => $(e).text().trim()).slice(1);
  // little bit redundant but required to keep classes in period order
  const classes = [];
  $('.AssignmentClass .sg-header .sg-header-heading:not(.sg-right)').each(function () {
    classes.push($(this).text().trim());
  });

  const courses = classes.map(c => {
    const {classHeader, courseName} = splitClassHeaderAndCourseName(c);
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
        course: classHeader + " (dropped)",
        name: splitClassHeaderAndCourseName($(this).find('.sg-header .sg-header-heading').eq(0).text().trim()).courseName.trim(),
        period: "dropped",
      }
    }
    ret[classHeader].average = $(this).find('.sg-header .sg-header-heading.sg-right').text().trim().split(' ').pop();
  });

  ret = Object.values(ret);
  const sessionData = session.defaults.jar.toJSON()
  res.send({
    termList: termList,
    term: term,
    classes: ret,
    session: sessionData,
  });
  return;
});

app.get('/schedule', async (req, res) => {
  const loginDetails = verifyLogin(req, res);
  if (!loginDetails) return;

  const { link, username, password } = loginDetails;

  let userLoginData = { ...loginData };
  userLoginData['LogOnDetails.UserName'] = username;
  userLoginData['LogOnDetails.Password'] = password;

  let session = createSession();

  if (req.query.session) {
    const cookies = JSON.parse(req.query.session);
    session.defaults.jar = CookieJar.fromJSON(cookies);
  }
  else {
    session = await loginSession(session, userLoginData, link);
  }
  if (typeof session == "object") {
    res.status(session.status || 401).send({ "success": false, "message": session.message });
    return
  }
  const registration = await session.get(link + "HomeAccess/Content/Student/Classes.aspx");
  if (registration.data.includes("Welcome to")) { res.status(401).send({ "success": false, "message": "Invalid Session" }); return; }
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

  const { link, username, password } = loginDetails;

  let userLoginData = { ...loginData };
  userLoginData['LogOnDetails.UserName'] = username;
  userLoginData['LogOnDetails.Password'] = password;

  let session = createSession();

  if (req.query.session) {
    const cookies = JSON.parse(req.query.session);
    session.defaults.jar = CookieJar.fromJSON(cookies);
  }
  else {
    session = await loginSession(session, userLoginData, link);
  }
  if (typeof session == "object") {
    res.status(session.status || 401).send({ "success": false, "message": session.message });
    return
  }

  const attendance = await session.get(link + "HomeAccess/Content/Attendance/MonthlyView.aspx");
  if (attendance.data.includes("Welcome to")) { res.status(401).send({ "success": false, "message": "Invalid Session" }); return; }
  const $ = cheerio.load(attendance.data);
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
      }
      else {
        if ($(this).attr('style')) {
          let color = $(this).attr('style').substring(17).split(';')[0].toLowerCase();
          events[formattedDate] = { event: key[color], color: color };
        }
      }
    }
  });
  let prev = $('a[title="Go to the previous month"]').attr('href').split('\'')[3];
  let next = $('a[title="Go to the next month"]').attr('href').split('\'')[3];

  const sessionData = session.defaults.jar.toJSON()
  res.send({
    prev: prev,
    next: next,
    month: mo.split(' ')[0],
    year: mo.split(' ')[1],
    events: events,
    session: sessionData,
  });
  return;
});

app.listen(port, () => {
  console.log(`HAC App listening at http://localhost:${port}`);
});
module.exports = app;
