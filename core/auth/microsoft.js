/**
 * Microsoft SSO — extension point (not yet implemented).
 *
 * When built, this mirrors core/auth/classlink.js: take a Microsoft auth cookie
 * from `loginData`, ride it to whatever app catalog / redirect lands the user on
 * the portal, and finish by following the platform tile chosen via `ssoFilter`.
 * Because it lives in core, enabling Microsoft for a platform will only require
 * adding 'microsoft' to that platform's `loginTypes` — no platform code changes.
 */

import { APIError } from '../errors.js';

// eslint-disable-next-line no-unused-vars
async function loginMicrosoft(session, loginData, ssoFilter, progressTracker) {
  throw new APIError('Microsoft login is not yet supported', 501);
}

export { loginMicrosoft };
