/**
 * Detect which sign-in methods a district's PowerSchool portal offers.
 *
 * Districts fall into three buckets:
 *   - credentials only : the public sign-in page shows the username/password form.
 *   - Microsoft (SSO)  : the portal federates to Azure AD — hitting the guardian
 *                        entry point redirects to login.microsoftonline.com, and
 *                        the sign-in page carries an OIDC "Sign in with…" link.
 *   - both             : the sign-in page shows the form AND an SSO button.
 *
 * The mobile app calls this after a district is picked so it can show the right
 * buttons (Microsoft sign-in is a WebView cookie handoff; see the microsoftSession
 * login type). Heuristic but cheap: read the sign-in page, then probe the OIDC
 * entry point and see where it lands.
 */

import { ENDPOINTS } from '../config/constants.js';

function finalUrl(res) {
  return res?.request?.res?.responseUrl || res?.request?.responseURL || '';
}

async function authMethods(session, link) {
  if (!link) return { credentials: true, microsoft: false, ssoUrl: null };

  let credentials = false;
  let microsoft = false;

  // 1. The public sign-in page: a password form means credentials; an OIDC /
  //    federated login link means an SSO option is offered.
  try {
    const page = await session.get(link + ENDPOINTS.SIGN_IN, {
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const html = typeof page.data === 'string' ? page.data : '';
    if (/name=["'](?:dbpw|account|pw)["']/i.test(html)) credentials = true;
    if (/oidc\/|openid_connect|SAMLRequest|identityProvider|ssoLoginLink|Sign\s*In\s*with/i.test(html)) {
      microsoft = true;
    }
  } catch { /* fall through to the probe */ }

  // 2. Probe the OIDC entry point: if the portal bounces to a Microsoft (or other
  //    federated) sign-in host, SSO is available — and if it's the ONLY method the
  //    district uses, this is how we detect it (the public page redirects away).
  try {
    const probe = await session.get(link + ENDPOINTS.OIDC_INIT, {
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const dest = finalUrl(probe);
    if (/login\.microsoftonline\.com|login\.microsoft|sts\.|adfs|\.okta\.com/i.test(dest)) {
      microsoft = true;
    }
    const probeHtml = typeof probe.data === 'string' ? probe.data : '';
    if (/name=["'](?:dbpw|account|pw)["']/i.test(probeHtml)) credentials = true;
  } catch { /* ignore */ }

  // Default to credentials if detection found nothing (safest fallback).
  if (!credentials && !microsoft) credentials = true;

  return {
    credentials,
    microsoft,
    // The URL the WebView loads to start the Microsoft sign-in. PowerSchool's OIDC
    // entry point redirects it to the district's Microsoft page.
    ssoUrl: microsoft ? link + ENDPOINTS.OIDC_INIT : null,
  };
}

export { authMethods };
