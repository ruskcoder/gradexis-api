/**
 * Generic ClassLink SSO — shared by every platform.
 *
 * The user reaches a portal through ClassLink one of two ways:
 *   - `classlink`            : they hand us a `clsession` cookie directly.
 *   - `classlinkCredentials` : they hand us ClassLink username/password (+ a
 *                              district `code`), we log into ClassLink for them,
 *                              optionally clearing a 2FA icon challenge.
 *
 * Both paths converge on the same finish: hit the ClassLink app catalog, pick
 * the tile whose name matches the platform's `ssoFilter`, and follow that tile's
 * URL — which drops us onto the platform already authenticated, no portal
 * password ever needed. The platform stays ignorant of ClassLink entirely; it
 * only contributes the `ssoFilter` search terms (and an optional `finalizeSSO`
 * hook for post-tile quirks like Conroe ISD).
 */

import { AuthenticationError, APIError } from '../errors.js';

const CLASSLINK_CREDENTIALS_DEFAULTS = {
  os: 'Windows',
  userdn: '',
  Browser: 'Chrome',
  Resolution: '1920x1080',
};

/**
 * Renders the 2FA icon-picker as a self-contained data: URL. When ClassLink
 * requires two-factor icon selection we can't answer it ourselves, so the login
 * fails with this HTML payload; the client shows it, the user picks an icon, and
 * retries with `loginData.clMFA` set to the chosen icon name.
 */
function generateIconIframe(iconData) {
  const iframeContent = `<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'><title>Icon Selection</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;background-color:#f5f5f5}.container{max-width:800px;margin:0 auto;background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}h2{text-align:center;color:#333;margin-bottom:30px}.icon-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:15px}.icon-item{display:flex;flex-direction:column;align-items:center;padding:15px;border:2px solid #e0e0e0;border-radius:8px;cursor:pointer;transition:all 0.3s ease;background:#fafafa}.icon-item:hover{border-color:#007bff;background:#f0f8ff;transform:translateY(-2px)}.icon-item img{width:48px;height:48px;margin-bottom:8px;object-fit:contain}.icon-name{font-size:12px;text-align:center;color:#666;word-break:break-word}</style></head><body><div class='container'><h2>Select an Icon</h2><div class='icon-grid' id='iconGrid'>${iconData.icons.map(icon => `<div class='icon-item' data-icon-id='${icon.id}' data-icon-name='${icon.name}'><img src='https://filescdn.classlink.com/resources/twofactor/${icon.name}' alt='${icon.short_name}' onerror='this.style.display=\"none\"'><div class='icon-name'>${icon.short_name}</div></div>`).join('')}</div></div><script>document.getElementById('iconGrid').addEventListener('click',function(e){const iconItem=e.target.closest('.icon-item');if(!iconItem)return;const selectedIcon={id:parseInt(iconItem.dataset.iconId),name:iconItem.dataset.iconName,short_name:iconItem.querySelector('.icon-name').textContent};window.parent.postMessage({type:'iconSelected',data:selectedIcon},'*');window.parent.postMessage({type:'closeIframe'},'*')});</script></body></html>`;
  const encodedContent = btoa(unescape(encodeURIComponent(iframeContent)));
  return `data:text/html;base64,${encodedContent}`;
}

/**
 * Log into ClassLink with username/password against a district `code`, returning
 * the `login_url` we can follow to obtain an OAuth code. Handles the optional
 * 2FA icon challenge by throwing an AuthenticationError whose message carries the
 * icon-picker payload (unless `clMFA` was supplied to answer it).
 */
async function loginWithClassLinkCredentials(session, loginData, progressTracker) {
  const { username, password, code, clMFA } = loginData;
  if (!code) {
    throw new AuthenticationError('A ClassLink district code is required for classlinkCredentials login');
  }

  const clLoginData = { ...CLASSLINK_CREDENTIALS_DEFAULTS, username, password, code };

  const districtPage = await session.get('https://launchpad.classlink.com/' + code);
  const csrfToken = districtPage.data.split('"csrfToken":"')[1].split('"')[0];

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

  // 2FA icon challenge (e.g. Conroe ISD). Without an answer, surface the picker.
  if (result.token && !result.login_url) {
    const icons = await session.get(
      `https://launchpad.classlink.com/proxies/api/twofactors?token=${result.token}`
    );
    if (!clMFA) {
      throw new AuthenticationError(generateIconIframe(icons.data));
    }
    const answered = await session.post(
      `https://launchpad.classlink.com/login/twoformauth/${result.token}`,
      { bresolution: '1680x1050', image1: clMFA },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    result.login_url = answered.data.split('redirect:"')[1].split('"')[0];
  }

  return result.login_url;
}

/**
 * Turn a ClassLink login (however we got there) into an authenticated OAuth
 * bearer token, using either a follow-able `login_url` (credentials path) or the
 * `clsession` cookie already sitting in the jar (clsession path).
 */
async function obtainClassLinkToken(session, loginUrl) {
  let exchangeCode;

  if (loginUrl) {
    const code = (await session.get(loginUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
    })).headers.location.split('code=')[1].split('&')[0];
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
    const jsLink = 'https://myapps.classlink.com/main' + landing.data.split('main')[1].split('"')[0];
    const js = await session.get(jsLink);
    const clientId = js.data.split('clientId:"')[1].split('"')[0];
    const auth1 = await session.get(
      `https://launchpad.classlink.com/oauth2/v2/auth?scope=full&redirect_uri=https%3A%2F%2Fmyapps.classlink.com%2Foauth%2F&client_id=${clientId}&response_type=code`,
      { maxRedirects: 0, validateStatus: (s) => s >= 200 && s < 400 }
    );
    const code = auth1.headers.location.split('code=')[1].split('&')[0];
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
 * @returns {Promise<{session, link, username, appUrl, exchangeCode}>}
 */
async function loginClassLink(session, loginData, ssoFilter, loginType, progressTracker) {
  if (!Array.isArray(ssoFilter) || ssoFilter.length === 0) {
    throw new APIError('This platform does not declare an ssoFilter, so ClassLink login is unavailable');
  }

  let loginUrl = null;
  if (loginType === 'classlinkCredentials') {
    loginUrl = await loginWithClassLinkCredentials(session, loginData, progressTracker);
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

export { loginClassLink, generateIconIframe };
