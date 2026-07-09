/**
 * PowerSchool username/password login.
 *
 * The handshake is a single form POST to guardian/home.html with the account +
 * password spread across the fields the sign-in form submits (see LOGIN_TEMPLATE).
 * A successful POST lands directly on the "Grades and Attendance" home page; a bad
 * one re-renders the sign-in form (name="dbpw") or an "Invalid Username or
 * Password!" message.
 *
 * PowerSchool keeps all real auth state in cookies, so — unlike Skyward — there
 * are no extra tokens to stash. Every data function just re-fetches an
 * authenticated /guardian page with the session's cookie jar.
 */

import { ValidationError, APIError } from '../../core/errors.js';
import { createSessionValidator, streamOrThrow, assertSafeHttpUrl } from '../../core/platform.js';
import { ERROR_MESSAGES, ENDPOINTS, LOGIN_TEMPLATE } from '../config/constants.js';
import { b64_md5, hex_hmac_md5 } from './psmd5.js';

/**
 * Normalize a PowerSchool portal URL. Districts hand out links with or without
 * the /public sign-in suffix and with inconsistent trailing slashes; collapse
 * them all to the bare origin with a single trailing slash.
 */
function formatLink(link) {
  if (!link) return undefined;
  link = link.trim();
  link = link.startsWith('http') ? link : 'https://' + link;
  // Strip a trailing /public or /public/ (the sign-in landing) and any trailing slash.
  link = link.replace(/\/+$/, '');
  link = link.replace(/\/public$/i, '');
  link = link + '/';
  return assertSafeHttpUrl(link);
}

// A logged-out / expired PowerSchool page is the sign-in form (name="dbpw") or an
// explicit invalid-login message. Real data pages never contain these, so this is
// safe to drive auto-relogin.
function isSessionExpired(html) {
  return typeof html === 'string' && (
    html.includes(ERROR_MESSAGES.SIGN_IN_FORM) ||
    html.includes(ERROR_MESSAGES.INVALID_LOGIN)
  );
}

// Guard used by data functions after each authenticated request.
const checkSessionValidity = createSessionValidator([
  ERROR_MESSAGES.INVALID_LOGIN,
  ERROR_MESSAGES.ACCESS_DENIED,
]);

/** Read a hidden input's value from the sign-in form HTML. */
function extractHidden(html, name) {
  if (typeof html !== 'string') return '';
  // Match name/value in either order within the <input> tag.
  const re = new RegExp(
    `<input[^>]*name=["']${name}["'][^>]*>|<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`,
    'i'
  );
  const tag = re.exec(html);
  if (!tag) return '';
  const full = tag[0];
  const val = /value=["']([^"']*)["']/i.exec(full);
  return val ? val[1] : '';
}

/**
 * Build the sign-in form fields for the portal.
 *
 * PowerSchool ships a client-side `doPCASLogin` that either (a) hashes the
 * password with a per-page `pstoken` (the common case), or (b) — on districts
 * that stub `md5.js` (e.g. HISD) — submits the password in the clear. We fetch
 * the sign-in page, and if it carries a non-empty `pstoken` we reproduce the
 * hashing exactly; otherwise we fall back to plaintext.
 */
function buildLoginFields(html, username, password) {
  const pstoken = extractHidden(html, 'pstoken');
  const contextData = extractHidden(html, 'contextData');

  if (pstoken) {
    return {
      ...LOGIN_TEMPLATE,
      pstoken,
      contextData,
      account: username,
      dbpw: b64_md5(pstoken + b64_md5(password)),
      ldappassword: hex_hmac_md5(pstoken, password),
      pw: '',
    };
  }

  // Plaintext district (stubbed md5.js): dbpw/pw/ldappassword all carry the raw
  // password, matching the captured HISD handshake.
  return {
    ...LOGIN_TEMPLATE,
    account: username,
    dbpw: password,
    pw: password,
    ldappassword: password,
  };
}

/**
 * core contract: (session, loginData, progressTracker)
 *   -> { session, link, username } on success
 *   -> undefined if streamOrThrow already sent a streaming error.
 */
async function credentialsAuth(session, loginData, progressTracker) {
  const { username, password } = loginData;
  const link = formatLink(loginData.link);
  if (!link) throw new ValidationError('link is required for credentials login');
  if (!username || !password) {
    throw new ValidationError('username and password are required for credentials login');
  }

  try {
    // Fetch the sign-in page first: it seeds the session cookie and, on hashing
    // districts, carries the pstoken/contextData the login POST must echo back.
    let pageHtml = '';
    try {
      const page = await session.get(link + ENDPOINTS.SIGN_IN, {
        validateStatus: (s) => s >= 200 && s < 400,
      });
      pageHtml = typeof page.data === 'string' ? page.data : '';
    } catch {
      // Fall back to plaintext if the sign-in page can't be read.
    }

    const body = new URLSearchParams(
      buildLoginFields(pageHtml, username, password)
    ).toString();

    const res = await session.post(link + ENDPOINTS.HOME, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: link + ENDPOINTS.SIGN_IN },
    });
    const html = typeof res.data === 'string' ? res.data : '';
    if (html.includes(ERROR_MESSAGES.INVALID_LOGIN) || html.includes(ERROR_MESSAGES.ACCESS_DENIED) ||
        html.includes(ERROR_MESSAGES.SIGN_IN_FORM)) {
      return streamOrThrow(progressTracker, 401, 'Invalid username or password');
    }

    session.setLastValidationTime(Date.now());
    return { session, link, username };
  } catch (error) {
    if (error instanceof ValidationError || error.status === 401) throw error;
    if (progressTracker && progressTracker.streaming) {
      progressTracker.error(error.status || 500, error.message || 'Login failed');
      return undefined;
    }
    throw new APIError(`Login failed: ${error.message}`);
  }
}

export { formatLink, isSessionExpired, checkSessionValidity, credentialsAuth };
