const HTTP_STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502
};

const ERROR_MESSAGES = {
    INVALID_LOGIN: "Welcome to",
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
    TRANSCRIPT: 'HomeAccess/Content/Student/Transcript.aspx',
    HOME: 'HomeAccess'
};

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

export {
    HTTP_STATUS,
    ERROR_MESSAGES,
    HAC_ENDPOINTS,
    MONTH_INPUTS,
    MONTH_NAMES
};

