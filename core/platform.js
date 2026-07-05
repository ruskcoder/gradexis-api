/**
 * Shared helpers a platform would otherwise copy verbatim. Keeping them here
 * means a platform folder contains only what actually differs between portals.
 */

import { AuthenticationError, ValidationError } from './errors.js';

// Hosts the API must never be tricked into fetching. Because every login flow
// takes a client-supplied `link` and makes server-side GET/POST requests to it,
// an unrestricted URL is a Server-Side Request Forgery (SSRF) vector: a client
// could point `link` at cloud metadata (169.254.169.254), localhost, or an
// internal service and have the API proxy it. We block loopback, link-local,
// and RFC-1918 private ranges. Portals are public internet hosts, so this costs
// nothing legitimate.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./, // link-local / cloud metadata
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0 – 172.31.255.255
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?fe80:/i, // IPv6 link-local
  /^\[?fc00:/i, // IPv6 unique-local
  /^\[?fd[0-9a-f]{2}:/i,
];

/**
 * Reject a portal URL that resolves to a private/loopback/link-local host or a
 * non-http(s) protocol. Throws ValidationError (400) so the caller surfaces a
 * clean message rather than the server actually issuing the request.
 * @param {string} url - an already-normalized absolute URL
 */
function assertSafeHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Invalid portal link');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError('Portal link must be http(s)');
  }
  const host = parsed.hostname;
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new ValidationError('Portal link host is not allowed');
  }
  return url;
}

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
  return assertSafeHttpUrl(link);
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

export { defaultFormatLink, createSessionValidator, streamOrThrow, assertSafeHttpUrl };
