from flask import Flask, request, send_from_directory
import json
import os
import requests
from bs4 import BeautifulSoup
from flask_cors import CORS, cross_origin
import pickle
import base64
from datetime import datetime

app = Flask(__name__)
CORS(app)

login_data = {
    "__RequestVerificationToken": "",
    "SCKTY00328510CustomEnabled": True,
    "SCKTY00436568CustomEnabled": True,
    "Database": 10,
    "VerificationOption": "UsernamePassword",
    "LogOnDetails.UserName": "",
    "tempUN": "",
    "tempPW": "",
    "LogOnDetails.Password": "",
}
mp_data = {
    "__EVENTTARGET": "ctl00$plnMain$btnRefreshView",
    "__EVENTARGUMENT": "",
    "__LASTFOCUS": "",
    "__VIEWSTATEGENERATOR": "B0093F3C",
    "ctl00$plnMain$ddlReportCardRuns": "",
}
month_data = {
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
month_headers = {
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
months = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
]

link = "https://homeaccess.katyisd.org/"

@app.route("/favicon.ico")
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, "static"),
        "favicon.ico",
        mimetype="image/vnd.microsoft.icon",
    )
 
def getAttendance(link, month, ses): 
    with requests.Session() as session:
        try:
            session = pickle.loads(base64.b64decode(str(ses).split(",")[1]))
            monthPage = session.get(
                link + "HomeAccess/Content/Attendance/MonthlyView.aspx"
            )
            calendar = BeautifulSoup(monthPage.text, "lxml")

            if calendar.select_one('table table td[align="center"]').text != month:
                monthWithoutYear = months.index(month.split(' ')[0])
                year = month.split(' ')[1]
                currentMonth = months.index(datetime.now().strftime("%B"))
                currentYear = datetime.now().strftime("%Y")
                
                return months[currentMonth:monthWithoutYear + (-1 if monthWithoutYear < currentMonth else 1): -1 if monthWithoutYear < currentMonth else 1]
                
                viewstate = calendar.find("input", attrs={"name": "__VIEWSTATE"})["value"]
                eventvalidation = calendar.find("input", attrs={"name": "__EVENTVALIDATION"})[
                    "value"
                ] 
                data = month_data
                data["__VIEWSTATE"] = viewstate
                data["__EVENTVALIDATION"] = eventvalidation
                data['__EVENTARGUMENT'] = "V" + str((datetime.strptime(month, "%B %Y") - datetime(2000, 1, 1)).days)
                print(data['__EVENTARGUMENT'])
                monthPost = session.post(
                    link + "HomeAccess/Content/Attendance/MonthlyView.aspx", data=data, 
                    headers=month_headers
                )
                calendar = BeautifulSoup(monthPost.text, "lxml")
            ret = {}
            colorKey = {}
            try:
                ret["title"] = calendar.select_one('table table td[align="center"]').text
            except:
                return {"error": "Unable to find month"}
            month = ret['title'].split(' ')[0]
            year = ret['title'].split(' ')[1]

            for element in calendar.select_one(".sg-clearfix").select(".sg-left"):
                color = element.select("span")[0].get("style")[-8:-1].lower()
                colorKey[color] = element.select("span")[1].text

            dates = calendar.select('td[align="center"]')[1:]
            dates = [date for i, date in enumerate(dates) if (i % 7 != 0 and i % 7 != 6)]
            dates = [date for date in dates if date.text and date.get('style') and 'background-color' in date.get('style')]
            events = [
                {
                    "date": int(datetime(int(year), months.index(month) + 1, int(item.text)).timestamp()),
                    "color": item.get("style").split("background-color:")[-1].split(";")[0].lower(),
                    "title": colorKey[item.get("style").split("background-color:")[-1].split(";")[0].lower()],
                }
                for item in dates
            ]
            ret['events'] = events
            return ret
        except Exception as e:
            return {"success": False, "error": str(e)}

def createSession(login_data, link):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        if "unsuccessful" in post.text:
            return None
        data_url = f"data:application/octet-stream;base64,{base64.b64encode(pickle.dumps(session)).decode('utf-8')}"
        return data_url
    
def getmp(args):
    return args["mp"] if ("mp" in args) else args["term"] if ("term" in args) else None

def getTerm(login_data, link):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        assignments = session.get(link + "HomeAccess/Content/Student/Assignments.aspx")
        assignmentSoup = BeautifulSoup(assignments.text, "lxml")
        term = assignmentSoup.find(
            "select", attrs={"name": "ctl00$plnMain$ddlReportCardRuns"}
        ).find("option", attrs={"selected": "selected"})["value"][:1]
        
        return term


def getAssignments(login_data, link, mp=None):
    with requests.Session() as ses:
        login_url = link + "HomeAccess/Account/LogOn"
        r = ses.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = ses.post(login_url, data=login_data)
        classes = []
        averages = []

        finaldata = {}
        string = ""

        if mp:
            assignmentsPage = ses.get(
                link + "HomeAccess/Content/Student/Assignments.aspx"
            )
            assignmentSoup = BeautifulSoup(assignmentsPage.text, "lxml")
            viewstate = assignmentSoup.find("input", attrs={"name": "__VIEWSTATE"})[
                "value"
            ]
            eventvalidation = assignmentSoup.find(
                "input", attrs={"name": "__EVENTVALIDATION"}
            )["value"]
            year = assignmentSoup.find(
                "select", attrs={"name": "ctl00$plnMain$ddlReportCardRuns"}
            ).find_all("option")[1]["value"][2:]
            data = mp_data
            data["__VIEWSTATE"] = viewstate
            data["__EVENTVALIDATION"] = eventvalidation
            data["ctl00$plnMain$ddlReportCardRuns"] = f"{mp}-{year}"
            assignments = ses.post(
                link + "HomeAccess/Content/Student/Assignments.aspx", data=data
            )
        else:
            assignments = ses.get(link + "HomeAccess/Content/Student/Assignments.aspx")

        content = BeautifulSoup(assignments.text, "lxml")

        for x in content.find_all("div", class_="AssignmentClass"):
            header = x.find("div", class_="sg-header")
            q = header.find("a", class_="sg-header-heading").text.strip()[12:]
            w = header.find("span", class_="sg-header-heading")
            classes.append(q.strip())
            averages.append(w.text.strip()[18:])

        string += "\n\nClass Averages:\n"
        for i in range(len(classes)):
            string += "\n" + classes[i] + " - " + averages[i]

        finaldata["classes"] = classes
        finaldata["averages"] = averages
        print(averages)
        assignmentstable = []
        assignmentsrow = []

        finaldata["assignment"] = []
        finaldata["categories"] = []
        for x in content.find_all("div", class_="AssignmentClass"):
            table = x.find("table", class_="sg-asp-table")
            if table is not None:
                for j in x.find_all("table", class_="sg-asp-table"):
                    for row in j.find_all("tr"):
                        for element in row.find_all("td"):
                            text = element.text.strip()
                            text = text.replace("*", "")
                            assignmentsrow.append(text.strip())
                        assignmentstable.append(assignmentsrow)
                        assignmentsrow = []
                    if "CourseCategories" in j.attrs["id"]:
                        finaldata["categories"].append(assignmentstable)
                    elif "CourseAssignments" in j.attrs["id"]:
                        finaldata["assignment"].append(assignmentstable)
                    assignmentstable = []
            else:
                finaldata["assignment"].append([])
                finaldata["categories"].append([])
        ret = {}
        for i in range(len(classes)):
            average = averages[i]
            assig = finaldata["assignment"][i]
            categories = finaldata["categories"][i]
            l = {}
            l["average"] = average
            l["assignments"] = assig
            l["categories"] = categories
            ret[classes[i]] = l

        if len(ret) == 0:
            return None

        return ret


def getInfo(login_data, link):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        ret = {}
        registration = session.get(link + "HomeAccess/Content/Student/Registration.aspx")
        content = BeautifulSoup(registration.text, "lxml")
        if content.find("span", id="plnMain_lblRegStudentName") is not None:
            ret["name"] = content.find(
                "span", id="plnMain_lblRegStudentName"
            ).text.strip()
            ret["grade"] = content.find("span", id="plnMain_lblGrade").text.strip()
            ret["school"] = content.find(
                "span", id="plnMain_lblBuildingName"
            ).text.strip()
            ret["dob"] = content.find("span", id="plnMain_lblBirthDate").text.strip()
            ret["councelor"] = content.find(
                "span", id="plnMain_lblCounselor"
            ).text.strip()
            ret["language"] = content.find(
                "span", id="plnMain_lblLanguage"
            ).text.strip()
            ret["cohort-year"] = content.find(
                "span", id="plnMain_lblCohortYear"
            ).text.strip()
            return ret
        else:
            return None


def getAssignmentClass(login_data, class_name, link, mp=None):
    with requests.Session() as ses:
        login_url = link + "HomeAccess/Account/LogOn"
        r = ses.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = ses.post(login_url, data=login_data)
        classes = []
        averages = []

        finaldata = {}
        string = ""

        if mp:
            assignmentsPage = ses.get(
                link + "HomeAccess/Content/Student/Assignments.aspx"
            )
            assignmentSoup = BeautifulSoup(assignmentsPage.text, "lxml")
            viewstate = assignmentSoup.find("input", attrs={"name": "__VIEWSTATE"})[
                "value"
            ]
            eventvalidation = assignmentSoup.find(
                "input", attrs={"name": "__EVENTVALIDATION"}
            )["value"]
            year = assignmentSoup.find(
                "select", attrs={"name": "ctl00$plnMain$ddlReportCardRuns"}
            ).find_all("option")[1]["value"][2:]
            data = mp_data
            data["__VIEWSTATE"] = viewstate
            data["__EVENTVALIDATION"] = eventvalidation
            data["ctl00$plnMain$ddlReportCardRuns"] = f"{mp}-{year}"
            assignments = ses.post(
                link + "HomeAccess/Content/Student/Assignments.aspx", data=data
            )
        else:
            assignments = ses.get(link + "HomeAccess/Content/Student/Assignments.aspx")
        content = BeautifulSoup(assignments.text, "lxml")

        for x in content.find_all("div", class_="AssignmentClass"):
            if x.find("div", class_="sg-header") is None:
                return None
            header = x.find("div", class_="sg-header")
            q = header.find("a", class_="sg-header-heading").text.strip()[12:]
            w = header.find("span", class_="sg-header-heading")
            classes.append(q.strip())
            averages.append(w.text.strip()[18:])

        string += "\n\nClass Averages:\n"
        for i in range(len(classes)):
            string += "\n" + classes[i] + " - " + averages[i]

        finaldata["classes"] = classes
        finaldata["averages"] = averages
        print(averages)
        assignmentstable = []
        assignmentsrow = []

        finaldata["assignment"] = []
        finaldata["categories"] = []
        for x in content.find_all("div", class_="AssignmentClass"):
            table = x.find("table", class_="sg-asp-table")
            if table is not None:
                for j in x.find_all("table", class_="sg-asp-table"):
                    for row in j.find_all("tr"):
                        for element in row.find_all("td"):
                            text = element.text.strip()
                            text = text.replace("*", "")
                            assignmentsrow.append(text.strip())
                        assignmentstable.append(assignmentsrow)
                        assignmentsrow = []
                    if "CourseCategories" in j.attrs["id"]:
                        finaldata["categories"].append(assignmentstable)
                    elif "CourseAssignments" in j.attrs["id"]:
                        finaldata["assignment"].append(assignmentstable)
                    assignmentstable = []
            else:
                finaldata["assignment"].append([])
                finaldata["categories"].append([])
        ret = {}
        for i in range(len(classes)):
            if classes[i] == class_name:
                average = averages[i]
                assig = finaldata["assignment"][i]
                categories = finaldata["categories"][i]
                l = {}
                l["average"] = average
                l["assignments"] = assig
                l["categories"] = categories
                ret[classes[i]] = l
                return ret

        return (
            json.dumps({"error": "class not found"}),
            404,
            {"ContentType": "application/json"},
        )


def getAverages(login_data, link, mp=None):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        classes = []
        averages = []
        if mp:
            assignmentsPage = session.get(
                link + "HomeAccess/Content/Student/Assignments.aspx"
            )
            assignmentSoup = BeautifulSoup(assignmentsPage.text, "lxml")
            viewstate = assignmentSoup.find("input", attrs={"name": "__VIEWSTATE"})[
                "value"
            ]
            eventvalidation = assignmentSoup.find(
                "input", attrs={"name": "__EVENTVALIDATION"}
            )["value"]
            year = assignmentSoup.find(
                "select", attrs={"name": "ctl00$plnMain$ddlReportCardRuns"}
            ).find_all("option")[1]["value"][2:]
            data = mp_data
            data["__VIEWSTATE"] = viewstate
            data["__EVENTVALIDATION"] = eventvalidation
            data["ctl00$plnMain$ddlReportCardRuns"] = f"{mp}-{year}"
            assignments = session.post(
                link + "HomeAccess/Content/Student/Assignments.aspx", data=data
            )
        else:
            assignments = session.get(
                link + "HomeAccess/Content/Student/Assignments.aspx"
            )

        content = BeautifulSoup(assignments.text, "lxml")

        for x in content.find_all("div", class_="AssignmentClass"):

            header = x.find("div", class_="sg-header")
            q = header.find("a", class_="sg-header-heading").text.strip()[12:]
            w = header.find("span", class_="sg-header-heading")
            classes.append(q.strip())
            averages.append(w.text.strip()[18:])

        ret = {}
        for i in range(len(classes)):
            ret[classes[i]] = averages[i]

        if len(ret) == 0:
            return None

        return ret


def getClasses(login_data, link, mp=None):
    with requests.Session() as session:
        print("faslkdfjlakjd")
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        classes = []
        if mp:
            assignmentsPage = session.get(
                link + "HomeAccess/Content/Student/Assignments.aspx"
            )
            assignmentSoup = BeautifulSoup(assignmentsPage.text, "lxml")
            viewstate = assignmentSoup.find("input", attrs={"name": "__VIEWSTATE"})[
                "value"
            ]
            eventvalidation = assignmentSoup.find(
                "input", attrs={"name": "__EVENTVALIDATION"}
            )["value"]
            year = assignmentSoup.find(
                "select", attrs={"name": "ctl00$plnMain$ddlReportCardRuns"}
            ).find_all("option")[1]["value"][2:]
            data = mp_data
            data["__VIEWSTATE"] = viewstate
            data["__EVENTVALIDATION"] = eventvalidation
            data["ctl00$plnMain$ddlReportCardRuns"] = f"{mp}-{year}"
            assignments = session.post(
                link + "HomeAccess/Content/Student/Assignments.aspx", data=data
            )
        else:
            assignments = session.get(
                link + "HomeAccess/Content/Student/Assignments.aspx"
            )
        content = BeautifulSoup(assignments.text, "lxml")

        for x in content.find_all("div", class_="AssignmentClass"):

            header = x.find("div", class_="sg-header")
            q = header.find("a", class_="sg-header-heading").text.strip()[12:]
            classes.append(q.strip())

        ret = {}
        ret["classes"] = classes
        return ret


def getReport(login_data, link):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        finaldata = {}
        reportcard = session.get(link + "HomeAccess/Content/Student/ReportCards.aspx")
        reportcardcontent = BeautifulSoup(reportcard.text, "lxml")
        headers = [
            "Course",
            "Description",
            "Period",
            "Teacher",
            "Room",
            "1st",
            "2nd",
            "3rd",
            "Exam1",
            "Sem1",
            "4th",
            "5th",
            "6th",
            "Exam2",
            "Sem2",
            "CND1",
            "CND2",
            "CND3",
            "CND4",
            "CND5",
            "CND6",
        ]
        row = []
        data = []
        finaldata["headers"] = headers
        counter = 0
        for x in reportcardcontent.find_all("td"):
            counter += 1
            # if counter <= 32:
            #     headers.append(x.text.strip())
            if counter > 32:
                row.append(x.text.strip())
            if (len(row) % 32 == 0) and (counter > 32):
                data.append(row)
                row = []
        for j in data:
            del j[31]
            del j[30]
            del j[29]
            del j[28]
            del j[27]
            del j[26]
            del j[25]
            del j[24]
            del j[23]
            del j[6]
            del j[5]
        finaldata["data"] = data
        if len(finaldata["data"]) == 0:
            return None
        return finaldata


def getProgressReport(login_data, link):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        finaldata = {}
        string = ""
        reportcard = session.get(
            link + "HomeAccess/Content/Student/InterimProgress.aspx"
        )
        reportcardcontent = BeautifulSoup(reportcard.text, "lxml")

        headers = []
        row = []
        data = []
        if reportcardcontent.find_all("tr") is None:
            return None
        for x in reportcardcontent.find_all("tr"):
            for c in x.find_all("td"):
                row.append(c.text.strip())
            data.append(row)
            row = []

        if len(data) == 0:
            return None
        headers = data[0]
        data.pop(0)
        finaldata["headers"] = headers
        finaldata["data"] = data
        return finaldata


def getName(login_data, link="https://homeaccess.katyisd.org/"):
    with requests.Session() as ses:
        data = {}
        login_url = link + "HomeAccess/Account/LogOn"
        print(login_url)
        r = ses.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = ses.post(login_url, data=login_data)
        page = ses.get(link + "HomeAccess/Home/WeekView")
        content = BeautifulSoup(page.text, "lxml")
        if content.find("div", class_="sg-banner-menu-container") is None:
            return None
        container = content.find("div", class_="sg-banner-menu-container")
        name = container.find("span")
        return name.text.strip()


def getTranscript(login_data, link):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        finaldata = []
        year = []
        semester = []
        transcript = session.get(link + "HomeAccess/Content/Student/Transcript.aspx")
        content = BeautifulSoup(transcript.text, "lxml")
        transcript = {}

        if content.find_all("td", class_="sg-transcript-group") is None:
            return None

        for x in content.find_all("td", class_="sg-transcript-group"):
            semester = {}
            table1 = x.find_next("table")
            table2 = table1.find_next("table")
            table3 = table2.find_next("table")
            for y in table1.find_all("span"):
                if "YearValue" in y.attrs["id"]:
                    semester["year"] = y.text.strip()
                if "GroupValue" in y.attrs["id"]:
                    semester["semester"] = y.text.strip()
                if "GradeValue" in y.attrs["id"]:
                    semester["grade"] = y.text.strip()
                if "BuildingValue" in y.attrs["id"]:
                    semester["school"] = y.text.strip()
            data = []
            semester["data"] = []
            for z in table2.find_all("tr"):
                if "sg-asp-table-header-row" in z.attrs["class"]:
                    for a in z.find_all("td"):
                        data.append(a.text.strip())
                    semester["data"].append(data)
                    data = []
                if "sg-asp-table-data-row" in z.attrs["class"]:
                    for a in z.find_all("td"):
                        data.append(a.text.strip())
                    semester["data"].append(data)
                    data = []
            for z in table3.find_all("label"):
                if "CreditValue" in z.attrs["id"]:
                    semester["credits"] = z.text.strip()
            transcript[semester["year"] + " - Semester " + semester["semester"]] = (
                semester
            )
        x = content.find("table", id="plnMain_rpTranscriptGroup_tblCumGPAInfo")

        if x is None:
            return None

        for y in x.find_all("tr", class_="sg-asp-table-data-row"):
            for z in y.find_all("span"):
                if "GPADescr" in z.attrs["id"]:
                    num = z.find_next("span")
                    text = z.text.strip()
                    transcript[text] = num.text.strip()

        transcript["Rank"] = content.find(
            "span", id="plnMain_rpTranscriptGroup_lblGPARank3"
        ).text.strip()
        return transcript


def getRank(login_data, link):
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        r = session.get(login_url)
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        post = session.post(login_url, data=login_data)
        finaldata = []
        year = []
        semester = []
        transcript = session.get(link + "HomeAccess/Content/Student/Transcript.aspx")
        content = BeautifulSoup(transcript.text, "lxml")
        rank = content.find(
            "span", id="plnMain_rpTranscriptGroup_lblGPARank3"
        ).text.strip()
        return rank


def checkLink(link):
    # try:
    with requests.Session() as session:
        login_url = link + "HomeAccess/Account/LogOn"
        try:
            print("succeeded")
            r = session.get(login_url)
        except:
            print("failed")
            return False
        soup = BeautifulSoup(r.content, "lxml")
        login_data["__RequestVerificationToken"] = soup.find(
            "input", attrs={"name": "__RequestVerificationToken"}
        )["value"]
        return True
    # except:
    #     print("fhkjldfajhklfdajklhdfsakl")
    #     return False


@app.route("/", methods=["GET"])
def home():
    return (
        json.dumps(
            {
                "success": True,
                "message": "This is the home page, visit the documentation at https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        200,
        {"Content-Type": "application/json"},
    )


@app.route("/help", methods=["GET"])
def help():
    return (
        json.dumps(
            {
                "message": "Official documentation for this API is available at https://homeaccesscenterapi-docs.vercel.app"
            }
        ),
        200,
        {"Content-Type": "application/json"},
    )


@app.route("/api/classes", methods=["GET"])
def classes():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getClasses(data, link, getmp(request.args))
        if len(content["classes"]) == 0:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )

        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/ipr", methods=["GET"])
def ipr():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getProgressReport(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/reportcard", methods=["GET"])
def reportcard():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getReport(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/averages", methods=["GET"])
def averages():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getAverages(data, link, getmp(request.args))
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/assignments", methods=["GET"])
def assignments():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        if "class" in request.args:
            content = getAssignmentClass(
                data, request.args["class"], link, getmp(request.args)
            )
            return json.dumps(content), 200, {"Content-Type": "application/json"}
        content = getAssignments(data, link, getmp(request.args))
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/info", methods=["GET"])
def info():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getInfo(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )

        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/transcript")
def transcript():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getTranscript(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/name")
def name():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getName(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps({"name": content}), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/rank")
def rank():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getRank(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps({"rank": content}), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/term")
def term():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = getTerm(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps({"term": content}), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )


@app.route("/api/attendance")
def calendar():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        ses = createSession(data, link)
        if ses is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        if "month" not in request.args:
            return (
                json.dumps(
            {
                "success": False,
                "message": "Missing required headers: month",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
            )
        content = getAttendance(link, request.args['month'], ses)
        return json.dumps(content), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )

@app.route("/api/session")
def session():
    if "user" in request.args and "pass" in request.args:
        link = "https://homeaccess.katyisd.org/"
        if "link" in request.args:
            link = request.args["link"]
            if link[-1] != "/":
                link += "/"
            if link[:8] != "https://":
                link = "https://" + link
            if not checkLink(link):
                return (
                    json.dumps({"success": False, "message": "Invalid link"}),
                    200,
                    {"Content-Type": "application/json"},
                )
        data = login_data
        data["LogOnDetails.UserName"] = request.args["user"]
        data["LogOnDetails.Password"] = request.args["pass"]
        content = createSession(data, link)
        if content is None:
            return (
                json.dumps(
                    {"success": False, "message": "Invalid username or password"}
                ),
                200,
                {"Content-Type": "application/json"},
            )
        return json.dumps({"session": content}), 200, {"Content-Type": "application/json"}
    return (
        json.dumps(
            {
                "success": False,
                "message": "Missing required headers: link, user and pass",
                "documentation": "https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        406,
        {"Content-Type": "application/json"},
    )

@app.errorhandler(404)
def page_not_found(e):
    return (
        json.dumps({"success": False, "message": "Page not found"}),
        404,
        {"Content-Type": "application/json"},
    )


@app.route("/api/")
def apiHelp():
    return (
        json.dumps(
            {
                "success": True,
                "message": "This is the home page, visit the documentation at https://homeaccesscenterapi-docs.vercel.app/",
            }
        ),
        200,
        {"Content-Type": "application/json"},
    )


if __name__ == "__main__":
    app.run(port=5000, debug=True)
