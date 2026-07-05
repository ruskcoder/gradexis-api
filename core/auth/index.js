/**
 * The one authentication entry point every route goes through.
 *
 * Responsibilities that used to be copy-pasted into each platform now live here:
 *   - validating the request body and the requested loginType,
 *   - reusing a still-fresh client session (no network round-trip),
 *   - dispatching to the right login flow (platform credentials, or a core SSO
 *     flow like ClassLink / Microsoft),
 *   - wrapping the result so an expired session transparently re-logs-in.
 *
 * A platform contributes only: `credentialsAuth`, `ssoFilter`, `loginTypes`,
 * `isSessionExpired`, optional `formatLink`, optional `finalizeSSO`, optional
 * `homeEndpoint`.
 */

import { createSession, restoreCookiesIntoSession } from '../session.js';
import { createReauthSession } from '../reauthSession.js';
import { defaultFormatLink } from '../platform.js';
import { AuthenticationError, ValidationError, APIError } from '../errors.js';
import { loginClassLink } from './classlink.js';
import { loginMicrosoft } from './microsoft.js';

const SSO_LOGIN_TYPES = new Set(['classlink', 'classlinkCredentials', 'microsoft']);

function validateBody(req, platform) {
  const accepted = platform.loginTypes || ['credentials'];
  const { loginType, loginData, session, options } = req.body || {};

  if (!loginType || !accepted.includes(loginType)) {
    throw new ValidationError(`loginType must be one of: ${accepted.join(', ')}`);
  }

  return {
    loginType,
    loginData: loginData || {},
    existingSession: session,
    options: options || {},
  };
}

function resolveLink(platform, loginData) {
  const formatLink = platform.formatLink || defaultFormatLink;
  return formatLink(loginData.link);
}

/**
 * Perform a FRESH login (no session reuse) for the given loginType.
 * Returns { session, link, username } or null if a streaming error was sent.
 */
async function performLogin(platform, loginType, loginData, progressTracker) {
  if (loginType === 'credentials') {
    const session = createSession();
    const result = await platform.credentialsAuth(session, loginData, progressTracker);
    if (!result) return null; // credentialsAuth already streamed an error
    return {
      session: result.session,
      link: result.link || resolveLink(platform, loginData),
      username: result.username,
    };
  }

  if (SSO_LOGIN_TYPES.has(loginType)) {
    const session = createSession();
    const runner = loginType === 'microsoft' ? loginMicrosoft : loginClassLink;
    const result = await runner(session, loginData, platform.ssoFilter, loginType, progressTracker);
    if (!result) return null;

    let { session: sess, link, username } = result;
    if (platform.finalizeSSO) {
      const finalized = await platform.finalizeSSO(sess, link, result);
      if (finalized) {
        sess = finalized.session || sess;
        link = finalized.link || link;
      }
    }
    return { session: sess, link, username };
  }

  throw new APIError(`Unsupported loginType: ${loginType}`);
}

async function authenticate(req, platform, progressTracker) {
  const { loginType, loginData, existingSession } = validateBody(req, platform);
  progressTracker.update(4, 'Authenticating');

  // Closure the reauth wrapper calls to transparently re-login on expiry.
  const relogin = async () => {
    const fresh = await performLogin(platform, loginType, loginData, null);
    if (!fresh) throw new AuthenticationError('Re-authentication failed');
    fresh.session.setLoginMetadata(loginType, loginData);
    return { session: fresh.session, link: fresh.link };
  };

  const finish = (base, link, username) => {
    base.setLoginMetadata(loginType, loginData);
    base.username = username || loginData.username || 'unknown';
    const session = platform.isSessionExpired
      ? createReauthSession(base, link, { isSessionExpired: platform.isSessionExpired, relogin })
      : base;
    return { session, link, username: username || loginData.username || 'unknown' };
  };

  // --- Fast path: reuse a session the client sent back ---
  if (existingSession && Object.keys(existingSession).length > 0) {
    const base = restoreCookiesIntoSession(createSession(), existingSession);
    const link = resolveLink(platform, loginData);

    if (base.isSessionFresh(5)) {
      if (link) return finish(base, link, loginData.username);
      // No link to fetch data with — fall through to a fresh login.
    } else if (link && platform.homeEndpoint !== undefined && platform.isSessionExpired) {
      // Cheap revalidation probe; if still logged in, skip the full login.
      try {
        const probe = await base.get(link + platform.homeEndpoint);
        if (!platform.isSessionExpired(probe.data)) {
          base.setLastValidationTime(Date.now());
          return finish(base, link, loginData.username);
        }
      } catch { /* fall through to a fresh login */ }
    }
  }

  // --- Fresh login ---
  const fresh = await performLogin(platform, loginType, loginData, progressTracker);
  if (!fresh) return null; // streaming error already sent
  return finish(fresh.session, fresh.link, fresh.username);
}

export { authenticate, performLogin };
