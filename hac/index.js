/**
 * HAC platform registry.
 *
 * This object is the entire public contract HAC exposes to core. Core turns it
 * into routes, drives every login type, streams progress, and formats responses.
 * HAC only provides: its own credentials login, the detectors core needs, an
 * SSO tile filter, an optional post-SSO hook, and one data function per route.
 */

import { HAC_ENDPOINTS } from './config/constants.js';
import { formatLink, credentialsAuth, isSessionExpired, listDistricts } from './auth/credentials.js';
import { finalizeSSO } from './auth/finalizeSSO.js';
import { info } from './data/info.js';
import { classes, singleClass } from './data/classes.js';
import { schedule } from './data/schedule.js';
import { attendance } from './data/attendance.js';
import { teachers } from './data/teachers.js';
import { ipr, reportCard, transcript } from './data/reports.js';

export default {
  name: 'HAC',
  mount: '/hac',
  ssoFilter: ['hac', 'homeaccess', 'home access'],
  loginTypes: ['credentials', 'classlink', 'classlinkCredentials'],
  homeEndpoint: HAC_ENDPOINTS.HOME,
  formatLink,
  credentialsAuth,
  isSessionExpired,
  listDistricts,
  finalizeSSO,
  data: {
    info,
    classes,
    singleClass,
    schedule,
    attendance,
    teachers,
    ipr,
    reportCard,
    transcript,
  },
};
