/**
 * Generic ClassLink SSO — shared by every platform.
 *
 * The user reaches a portal through ClassLink one of two ways:
 *   - `classlink`            : they hand us a `clsession` cookie directly.
 *   - `classlinkCredentials` : they hand us ClassLink username/password (+ a
 *                              district `code`), we log into ClassLink for them,
 *                              clearing a 2FA challenge (PIN or image) if present.
 *
 * Both paths converge on the same finish: hit the ClassLink app catalog, pick
 * the tile whose name matches the platform's `ssoFilter`, and follow that tile's
 * URL — which drops us onto the platform already authenticated, no portal
 * password ever needed. The platform stays ignorant of ClassLink entirely; it
 * only contributes the `ssoFilter` search terms (and an optional `finalizeSSO`
 * hook for post-tile quirks like Conroe ISD).
 *
 * Two-factor authentication
 * -------------------------
 * Some districts require a second factor after the password. ClassLink offers
 * two challenge kinds we support:
 *   - `pin`   : the user enters a fixed 6-digit PIN.
 *   - `image` : the user picks their secret icon out of a randomized grid.
 * Both are answered by POSTing to the same `/login/twoformauth/{token}` endpoint
 * and succeed when the response carries a `redirect:"…oauth2…"` string.
 *
 * Because clearing the challenge needs a second round-trip *from the user*, the
 * flow is resumable: the first call surfaces `{ mfaRequired, mfaType, icons }`
 * and stashes the ClassLink `token` in the session's serialized cache. The client
 * shows the prompt, then re-calls with the same `session` plus `loginData.clMFA`
 * (the PIN string or the chosen icon filename) and we pick up where we left off.
 * A client that already knows the answer can also pass `clMFA` on the first call
 * and clear the whole thing in a single request.
 */

import { AuthenticationError, APIError } from '../errors.js';

/**
 * Pull the substring between `start` and the next `end`, throwing a clean
 * AuthenticationError if either marker is missing. Replaces the bare
 * `text.split(start)[1].split(end)[0]` chains, which throw an opaque
 * `TypeError: Cannot read properties of undefined` (→ unhandled 500) the moment
 * ClassLink tweaks its markup.
 */
function extractBetween(text, start, end, label) {
  if (typeof text !== 'string') {
    throw new AuthenticationError(`ClassLink login failed (unexpected ${label} response)`);
  }
  const from = text.indexOf(start);
  if (from === -1) {
    throw new AuthenticationError(`ClassLink login failed (could not read ${label})`);
  }
  const rest = text.slice(from + start.length);
  const to = rest.indexOf(end);
  // Mirror `rest.split(end)[0]`: when the end marker is absent, take the whole
  // remainder (e.g. an OAuth redirect that ends with `code=xxx` and no `&`).
  return to === -1 ? rest : rest.slice(0, to);
}

const CLASSLINK_CREDENTIALS_DEFAULTS = {
  os: 'Windows',
  userdn: '',
  Browser: 'Chrome',
  Resolution: '1920x1080',
};

/**
 * Inspect the `/login/twoformauth/{token}` challenge page and decide which kind
 * of second factor ClassLink is asking for. The page markup is stable enough to
 * fingerprint: the PIN page renders an `MFA Pin Entry` heading and a
 * `verify-pin-auth` input, the image page renders a `Multi-factor Image` prompt
 * and an `auth-image` thumbnail. Defaults to `image` (the older, more common
 * kind) if neither fingerprint matches, so an unknown variant still surfaces a
 * challenge rather than crashing.
 */
function detectMfaType(challengeHtml) {
  const html = typeof challengeHtml === 'string' ? challengeHtml : '';
  if (/verify-pin-auth|MFA Pin Entry|name="pin"/i.test(html)) return 'pin';
  return 'image';
}

/**
 * Answer a ClassLink 2FA challenge and return the follow-able `login_url`.
 *
 * PIN and image challenges post to the same endpoint but with different fields
 * (`pin` vs `image1`). Success is signalled by a `redirect:"…"` string in the
 * "Remember my device" page ClassLink returns; its absence means the PIN was
 * wrong or the wrong icon was picked, which we translate into a clean 401.
 */
async function answerMfaChallenge(session, token, mfaType, clMFA) {
  const body = mfaType === 'pin'
    ? { pin: clMFA }
    : { bresolution: '1680x1050', image1: clMFA };

  const answered = await session.post(
    `https://launchpad.classlink.com/login/twoformauth/${token}`,
    body,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (typeof answered.data !== 'string' || !answered.data.includes('redirect:"')) {
    throw new AuthenticationError(
      mfaType === 'pin' ? 'Incorrect ClassLink PIN' : 'Incorrect ClassLink image selected'
    );
  }
  return extractBetween(answered.data, 'redirect:"', '"', '2FA response');
}

/**
 * Log into ClassLink with username/password against a district `code`.
 *
 * Returns one of:
 *   - `{ loginUrl }`      : password (and any 2FA) cleared — follow it for OAuth.
 *   - `{ mfaRequired }`   : a second factor is needed; carries `mfaType` and,
 *                           for image challenges, the `icons` grid to render.
 *                           The ClassLink `token` is stashed in `session.cache`
 *                           so a follow-up call (same session + `clMFA`) resumes.
 *
 * If the caller is resuming — a `mfaToken` sits in the session cache and a
 * `clMFA` answer is supplied — we skip straight to answering the challenge.
 */
async function loginWithClassLinkCredentials(session, loginData, progressTracker) {
  const { username, password, code, clMFA } = loginData;

  // --- Resume path: an earlier call already got us a challenge token ---
  const pendingToken = session.cache?.mfaToken;
  if (pendingToken && clMFA) {
    const mfaType = session.cache?.mfaType || 'image';
    progressTracker?.update?.(22, 'Verifying two-factor code');
    const loginUrl = await answerMfaChallenge(session, pendingToken, mfaType, clMFA);
    delete session.cache.mfaToken;
    delete session.cache.mfaType;
    return { loginUrl };
  }

  if (!code) {
    throw new AuthenticationError('A ClassLink district code is required for classlinkCredentials login');
  }

  const clLoginData = { ...CLASSLINK_CREDENTIALS_DEFAULTS, username, password, code };

  const districtPage = await session.get('https://launchpad.classlink.com/' + code);
  const csrfToken = extractBetween(districtPage.data, '"csrfToken":"', '"', 'district page');

  progressTracker?.update?.(20, 'Logging in to ClassLink');
  const loginResponse = await session.post(
    'https://launchpad.classlink.com/login',
    clLoginData,
    { headers: { 'csrf-token': csrfToken } }
  );

  const result = loginResponse.data;
  if (result.ResultCode == 0) {
    throw new AuthenticationError(result.ResultDescription || 'ClassLink login failed');
  }

  // No 2FA: ClassLink handed us a directly follow-able login URL.
  if (result.login_url) {
    return { loginUrl: result.login_url };
  }

  // 2FA required: ClassLink returns a `token` and no `login_url`. Load the
  // challenge page to learn whether it's a PIN or an image pick.
  if (result.token) {
    const challengePage = await session.get(
      `https://launchpad.classlink.com/login/twoformauth/${result.token}`
    );
    const mfaType = detectMfaType(challengePage.data);

    // If the client already knows the answer, clear it in this same request.
    if (clMFA) {
      progressTracker?.update?.(22, 'Verifying two-factor code');
      return { loginUrl: await answerMfaChallenge(session, result.token, mfaType, clMFA) };
    }

    // Otherwise surface the challenge and remember the token for the follow-up.
    let icons = null;
    if (mfaType === 'image') {
      const twofactors = await session.get(
        `https://launchpad.classlink.com/proxies/api/twofactors?token=${result.token}`
      );
      icons = (twofactors.data?.icons || []).map((icon) => ({
        ...icon,
        // Convenience for the client: the full CDN URL of each candidate icon.
        imageUrl: `https://filescdn.classlink.com/resources/twofactor/${icon.name}`,
      }));
    }

    session.cache.mfaToken = result.token;
    session.cache.mfaType = mfaType;
    return { mfaRequired: true, mfaType, icons };
  }

  throw new AuthenticationError('ClassLink login failed (unexpected login response)');
}

/**
 * Turn a ClassLink login (however we got there) into an authenticated OAuth
 * bearer token, using either a follow-able `login_url` (credentials path) or the
 * `clsession` cookie already sitting in the jar (clsession path).
 */
async function obtainClassLinkToken(session, loginUrl) {
  let exchangeCode;

  if (loginUrl) {
    const location = (await session.get(loginUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
    })).headers.location;
    const code = extractBetween(location, 'code=', '&', 'OAuth redirect');
    exchangeCode = await session.get(
      `https://myapps.apis.classlink.com/exchangeCode?code=${code}&response_type=code`
    );
  } else {
    // clsession cookie path: walk the OAuth dance from the launchpad root.
    const landing = await session.get('https://launchpad.classlink.com/');
    if (landing.data.includes('Find your login page')) {
      throw new AuthenticationError(
        'Invalid ClassLink session. Maybe you signed out? Try signing in again.'
      );
    }
    const jsLink = 'https://myapps.classlink.com/main' +
      extractBetween(landing.data, 'main', '"', 'launchpad landing');
    const js = await session.get(jsLink);
    const clientId = extractBetween(js.data, 'clientId:"', '"', 'client id');
    const auth1 = await session.get(
      `https://launchpad.classlink.com/oauth2/v2/auth?scope=full&redirect_uri=https%3A%2F%2Fmyapps.classlink.com%2Foauth%2F&client_id=${clientId}&response_type=code`,
      { maxRedirects: 0, validateStatus: (s) => s >= 200 && s < 400 }
    );
    // `extractBetween` accepts the marker at the very start, so a location that
    // begins with "code=" (no leading text) still parses.
    const code = extractBetween(auth1.headers.location, 'code=', '&', 'OAuth redirect');
    await session.get(auth1.headers.location);
    exchangeCode = await session.get(
      `https://myapps.apis.classlink.com/exchangeCode?code=${code}&response_type=code`
    );
  }

  const token = exchangeCode.data.token || exchangeCode.data.access_token || exchangeCode.data;
  return { token, exchangeCode };
}

/**
 * The single entry point core's auth dispatcher calls for SSO logins.
 *
 * @param {object} session - fresh core session
 * @param {object} loginData - { clsession } or { username, password, code, clMFA }
 * @param {string[]} ssoFilter - platform tile-name search terms
 * @param {string} loginType - 'classlink' | 'classlinkCredentials'
 * @param {object} [progressTracker]
 * @returns {Promise<{session, link, username, appUrl, exchangeCode}
 *                  | {mfaRequired, mfaType, icons, session}>}
 */
async function loginClassLink(session, loginData, ssoFilter, loginType, progressTracker) {
  if (!Array.isArray(ssoFilter) || ssoFilter.length === 0) {
    throw new APIError('This platform does not declare an ssoFilter, so ClassLink login is unavailable');
  }

  let loginUrl = null;
  if (loginType === 'classlinkCredentials') {
    const outcome = await loginWithClassLinkCredentials(session, loginData, progressTracker);
    // A second factor is pending — bubble the challenge up so the route can hand
    // the (cookie- and token-carrying) session back to the client to answer.
    if (outcome.mfaRequired) {
      return { mfaRequired: true, mfaType: outcome.mfaType, icons: outcome.icons, session };
    }
    loginUrl = outcome.loginUrl;
  } else {
    if (!loginData.clsession) {
      throw new AuthenticationError('clsession is required for classlink login');
    }
    await session.defaults.jar.setCookie(
      `clsession=${loginData.clsession}; Domain=.classlink.com; Path=/`,
      'https://classlink.com'
    );
  }

  progressTracker?.update?.(25, 'Authenticating through ClassLink');
  const { token, exchangeCode } = await obtainClassLinkToken(session, loginUrl);

  const apps = (await session.get('https://applications.apis.classlink.com/v1/v3/applications?', {
    headers: { Authorization: `Bearer ${token}` },
  })).data;

  // Best-effort session bookkeeping calls ClassLink's own web app makes; ignored
  // if they fail since they don't affect the tile URL.
  try {
    await session.get('https://myapps.apis.classlink.com/v1/pageLoad?', {
      headers: { Authorization: `Bearer ${token}` },
    });
    await session.post('https://myapps.apis.classlink.com/v1/sessions/start?', {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* non-fatal */ }

  progressTracker?.update?.(35, 'Finding your school portal');
  const match = apps.find((app) =>
    ssoFilter.some((term) => app.name.toLowerCase().includes(term.toLowerCase()))
  );
  if (!match) {
    throw new AuthenticationError('Could not find a matching app on your ClassLink dashboard');
  }

  const appUrl = match.url[0];
  const follow = await session.get(appUrl); // follow the tile — authenticates the portal
  const link = new URL(appUrl).origin + '/';
  const username = exchangeCode?.data?.user?.loginId;

  // `appHtml` is the landing page; a platform's finalizeSSO may keep it as splash
  // (e.g. HAC reads the district banner from it) or override it after extra steps.
  return { session, link, username, appUrl, appHtml: follow.data, exchangeCode };
}

export { loginClassLink };
