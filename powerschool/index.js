/**
 * PowerSchool (Student & Parent portal) platform registry.
 *
 * Data-driven end to end: term columns, per-term grade links and the exact
 * section-id / date tuple the assignment lookup needs are all read from the
 * portal's own home-grid markup, so districts with any term layout (P1/C1…,
 * T1-T4, Q1-Q4, …) and letter- or number-based averages work without config.
 *
 * Multi-student parent accounts are supported statelessly: every response carries
 * a `students` list + the active `studentId`; the client passes `options.studentId`
 * to switch which child the data is for.
 *
 * Login types:
 *   - credentials     : portal username/password.
 *   - microsoftSession: districts that federate to Azure AD / Office 365. The
 *                       mobile app completes Microsoft's real sign-in in a WebView
 *                       and hands over the resulting portal cookies (core seeds
 *                       them + validates); no server-side IdP scraping. `/authMethods`
 *                       tells the client which of these a given district offers.
 */

import { credentialsAuth, isSessionExpired, formatLink } from './auth/credentials.js';
import { authMethods } from './auth/authMethods.js';
import { info } from './data/info.js';
import { classes, singleClass } from './data/classes.js';
import { schedule } from './data/schedule.js';
import { bellSchedule } from './data/bellSchedule.js';
import { attendance } from './data/attendance.js';
import { teachers } from './data/teachers.js';
import { reportCard } from './data/reports.js';

export default {
  name: 'PowerSchool',
  mount: '/powerschool',
  ssoFilter: ['powerschool'],
  loginTypes: ['credentials', 'microsoftSession'],
  // The home grid is the cheapest authenticated page for the session probe.
  homeEndpoint: 'guardian/home.html',
  formatLink,
  credentialsAuth,
  authMethods,
  isSessionExpired,
  data: {
    info,
    classes,
    singleClass,
    schedule,
    bellSchedule,
    attendance,
    teachers,
    reportCard,
  },
};
