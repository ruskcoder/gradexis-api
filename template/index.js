/**
 * Platform registry — copy this folder to add a platform (`cp -r template myplatform`).
 *
 * This object is the WHOLE contract your platform exposes to core. Core owns all
 * public routes, every login type (credentials + SSO), progress streaming, the
 * response envelope, and error handling. You fill in only what's unique to your
 * portal:
 *   - `credentialsAuth`  : your username/password handshake
 *   - `ssoFilter`        : which ClassLink/SSO dashboard tile is yours
 *   - `isSessionExpired` : detect a logged-out page (powers auto-relogin)
 *   - `data.*`           : one fetch-and-parse function per route
 *
 * Delete any `data` key you don't support — core returns a clean 404 for it.
 * Add 'classlinkCredentials' / 'microsoft' to `loginTypes` when you want those
 * SSO paths; they need zero extra code here (core provides them).
 */

import { credentialsAuth, isSessionExpired } from './auth/credentials.js';
import { info } from './data/info.js';
import { classes, singleClass } from './data/classes.js';
import { schedule } from './data/schedule.js';
import { attendance } from './data/attendance.js';
import { teachers } from './data/teachers.js';
import { ipr, reportCard, transcript } from './data/reports.js';

export default {
  name: 'Template',              // TODO rename
  mount: '/template',            // TODO the URL prefix this platform serves
  ssoFilter: ['template'],       // TODO tile-name search terms on the SSO dashboard
  loginTypes: ['credentials'],   // TODO add 'classlink' etc. when supported
  homeEndpoint: '',              // path appended to link for the cheap session probe
  // formatLink,                 // optional: only if the portal needs custom URL normalization
  credentialsAuth,
  isSessionExpired,
  // finalizeSSO,                // optional: post-SSO-tile fixups (see hac/auth/finalizeSSO.js)
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
