/**
 * Skyward legacy (Skyport / Student & Family Access) platform registry.
 *
 * Data-driven end to end: student/entity ids and every per-term detail request
 * are read from the gradebook's own `showGradeInfo` anchors, so districts with
 * any term layout (PR1/1ST/SM1, T1-T4, Q1-Q4, ...) work without configuration.
 */

import { credentialsAuth, isSessionExpired } from './auth/credentials.js';
import { info } from './data/info.js';
import { classes, singleClass } from './data/classes.js';
import { schedule } from './data/schedule.js';
import { bellSchedule } from './data/bellSchedule.js';
import { attendance } from './data/attendance.js';
import { teachers } from './data/teachers.js';
import { transcript, reportCard } from './data/reports.js';

export default {
  name: 'Skyward Legacy',
  mount: '/skyward-legacy',
  ssoFilter: ['skyward'],
  loginTypes: ['credentials'],
  // Gradebook is the cheapest authenticated page for the session-validity probe.
  homeEndpoint: 'scripts/wsisa.dll/WService=wsEAplus/sfgradebook001.w',
  credentialsAuth,
  isSessionExpired,
  data: {
    info,
    classes,
    singleClass,
    schedule,
    bellSchedule,
    attendance,
    teachers,
    transcript,
    reportCard,
  },
};
