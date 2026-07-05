/**
 * Shared helpers a platform would otherwise copy verbatim. Keeping them here
 * means a platform folder contains only what actually differs between portals.
 */

import { AuthenticationError } from './errors.js';

/**
 * Normalize a portal base URL: trim, force a trailing slash, force https.
 * Used automatically by core when a platform doesn't provide its own
 * `formatLink` (override only when the portal needs special handling, e.g. HAC
 * stripping a `/HomeAccess` suffix).
 */
function defaultFormatLink(link) {
  if (!link) return undefined;
  link = link.trim();
  link = link.endsWith('/') ? link : link + '/';
  link = link.startsWith('http') ? link : 'https://' + link;
  return link;
}

/**
 * Build a data-function guard that throws when a fetched page is really a
 * logged-out / bad-password page. Pass the portal's failure fingerprint(s):
 *   const checkSessionValidity = createSessionValidator(ERROR_MESSAGES.INVALID_LOGIN);
 * then call `checkSessionValidity(response)` after each authenticated request.
 */
function createSessionValidator(markers, message = 'Invalid session or password') {
  const list = Array.isArray(markers) ? markers : [markers];
  return function checkSessionValidity(response) {
    const html = response?.data;
    if (typeof html === 'string' && list.some((m) => html.includes(m))) {
      throw new AuthenticationError(message);
    }
  };
}

/**
 * During a login flow, deliver an auth failure the right way for the request
 * mode: mid-stream (returning undefined so the dispatcher stops) when streaming,
 * or by throwing for the route's catch when not.
 */
function streamOrThrow(progressTracker, status, message) {
  if (progressTracker && progressTracker.streaming) {
    progressTracker.error(status, message);
    return undefined;
  }
  throw new AuthenticationError(message);
}

export { defaultFormatLink, createSessionValidator, streamOrThrow };
