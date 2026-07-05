/**
 * The ONLY auth code a platform must write. Everything generic (link
 * normalization, the streaming-vs-throw error helper, the session-validity
 * guard body) lives in core/platform.js — you just supply the portal-specific
 * bits below.
 *
 * You write two things:
 *   - `isSessionExpired(html)` — what a logged-out page looks like (auto-relogin)
 *   - `credentialsAuth(...)`   — your portal's username/password handshake
 * `checkSessionValidity` is derived for you from your INVALID_LOGIN marker.
 */

import { ValidationError, APIError } from '../../core/errors.js';
import { createSessionValidator, streamOrThrow } from '../../core/platform.js';
import { ERROR_MESSAGES, ENDPOINTS } from '../config/constants.js';

// TODO: detect a logged-out / expired page for your portal.
function isSessionExpired(html) {
  return typeof html === 'string' && html.includes(ERROR_MESSAGES.INVALID_SESSION);
}

// Guard used by data functions after each authenticated request.
const checkSessionValidity = createSessionValidator(ERROR_MESSAGES.INVALID_LOGIN);

/**
 * core contract: (session, loginData, progressTracker)
 *   -> { session, username } on success
 *   -> undefined if streamOrThrow already sent a streaming error.
 * (link is normalized by core's defaultFormatLink unless you set `formatLink`
 * on the registry.)
 */
async function credentialsAuth(session, loginData, progressTracker) {
  const { username, password, link } = loginData;
  if (!link) throw new ValidationError('link is required for credentials login');
  if (!username || !password) {
    throw new ValidationError('username and password are required for credentials login');
  }

  try {
    // TODO: the real handshake —
    //   const { data: page } = await session.get(link + ENDPOINTS.LOGIN);
    //   const result = await session.post(link + ENDPOINTS.LOGIN, { username, password });
    //   if (result.data.includes(ERROR_MESSAGES.INVALID_LOGIN))
    //       return streamOrThrow(progressTracker, 401, 'Invalid username or password');

    session.setLastValidationTime(Date.now());
    return { session, username };
  } catch (error) {
    if (progressTracker && progressTracker.streaming) {
      progressTracker.error(error.status || 500, error.message || 'Login failed');
      return undefined;
    }
    throw new APIError(`Login failed: ${error.message}`);
  }
}

export { isSessionExpired, checkSessionValidity, credentialsAuth };
