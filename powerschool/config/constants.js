/**
 * PowerSchool (Student & Parent portal, "guardian" pages) constants.
 *
 * `link` is the portal base (e.g. https://hisdconnect.powerschool.com/). Every
 * endpoint below is appended to it. PowerSchool serves classic server-rendered
 * HTML under /guardian/* and a small JSON web-service layer under /ws/*.
 */

const ERROR_MESSAGES = {
  // Markers of a logged-out / bad-credential page. When a session dies PowerSchool
  // serves the sign-in form again (which carries name="dbpw"), so that field name
  // is the most reliable "you are not logged in" fingerprint.
  INVALID_LOGIN: 'Invalid Username or Password!',
  ACCESS_DENIED: 'Access denied',
  SIGN_IN_FORM: 'name="dbpw"',
  MISSING_PARAMETERS: 'Missing one or more required parameters',
  BELL_SCHEDULE_NOT_FOUND: 'Bell Schedule not found',
  CLASS_NOT_FOUND: 'Class not found',
  DETAIL_FAILED: 'Could not load assignment detail for this class',
};

const ENDPOINTS = {
  // Public sign-in page (carries pstoken/contextData on hashing districts).
  SIGN_IN: 'public/home.html',
  HOME: 'guardian/home.html',
  SCORES: 'guardian/scores.html',
  ASSIGNMENT_LOOKUP: 'ws/xte/assignment/lookup',
  TERM_GRADES: 'guardian/termgrades.html',
  ATTENDANCE: 'guardian/attendance.html',
  MY_SCHEDULE: 'guardian/myschedule.html',
  SCHOOL_INFO: 'guardian/schoolinformation.html',
  // Portal-initiated OIDC entry point (used by Microsoft SSO). The _userTypeHint
  // keeps PowerSchool from bouncing to its account-type chooser.
  OIDC_INIT: 'guardian/home.html?_userTypeHint=student',
};

// The static field bundle PowerSchool's sign-in form posts. account/pw are filled
// per request; the district portals in scope accept the plaintext password across
// dbpw/pw/ldappassword (no client-side DES/MD5 hashing), matching the browser HAR.
const LOGIN_TEMPLATE = {
  dbpw: '',
  translator_username: '',
  translator_password: '',
  translator_ldappassword: '',
  returnUrl: '',
  serviceName: 'PS Parent Portal',
  serviceTicket: '',
  pcasServerUrl: '/',
  credentialType: 'User Id and Password Credential',
  ldappassword: '',
  request_locale: 'en_US',
  account: '',
  pw: '',
  translatorpw: '',
};

// Headers PowerSchool's Angular front-end sends on the /ws/xte JSON calls. Without
// the JSON content-type the assignment lookup returns an error page instead of data.
const WS_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json;charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
};

export { ERROR_MESSAGES, ENDPOINTS, LOGIN_TEMPLATE, WS_HEADERS };
