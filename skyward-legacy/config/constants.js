/**
 * Skyward (legacy "Skyport" / Student & Family Access) constants.
 *
 * All portal pages live under the wsEAplus service. `link` is the portal base
 * (e.g. https://skyward.springbranchisd.com/); every endpoint below is appended
 * to it. The detail dialog goes through httploader.p with a `file=` query.
 */

const ERROR_MESSAGES = {
  // Skyward returns a tiny "...invalid..." blob on a bad login / expired session.
  INVALID_LOGIN: 'invalid',
  INVALID_USERNAME_PASSWORD: 'Invalid username or password',
  MISSING_PARAMETERS: 'Missing one or more required parameters',
  BELL_SCHEDULE_NOT_FOUND: 'Bell Schedule not found',
};

const SKYWARD_ENDPOINTS = {
  LOGIN: 'scripts/wsisa.dll/WService=wsEAplus/seplog01.w',
  LOGIN_POST: 'scripts/wsisa.dll/WService=wsEAplus/skyporthttp.w',
  HOME: 'scripts/wsisa.dll/WService=wsEAplus/sfhome01.w',
  GRADEBOOK: 'scripts/wsisa.dll/WService=wsEAplus/sfgradebook001.w',
  CLASS_DETAILS: 'scripts/wsisa.dll/WService=wsEAplus/httploader.p?file=sfgradebook001.w',
  INFO: 'scripts/wsisa.dll/WService=wsEAplus/sfstudentinfo001.w',
  SCHEDULE: 'scripts/wsisa.dll/WService=wsEAplus/sfschedule001.w',
  ATTENDANCE: 'scripts/wsisa.dll/WService=wsEAplus/sfattendance001.w',
  ACADEMIC_HISTORY: 'scripts/wsisa.dll/WService=wsEAplus/sfacademichistory001.w',
};

export { ERROR_MESSAGES, SKYWARD_ENDPOINTS };
