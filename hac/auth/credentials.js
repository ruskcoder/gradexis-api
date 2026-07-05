/**
 * HAC's own username/password login — the one piece core can't do generically,
 * because it's specific to HomeAccessCenter's ASP.NET login form (CSRF token,
 * optional district `select`, the `Welcome to` = failure fingerprint).
 *
 * Also exports the two detectors core needs from every platform:
 *   - `isSessionExpired(html)` — powers transparent auto-relogin
 *   - `checkSessionValidity(response)` — throws inside data functions on a
 *     logged-out page
 * and `formatLink`, HAC's portal-URL normalizer.
 */

import process from 'process';
import * as cheerio from 'cheerio';
import { AuthenticationError, ValidationError, APIError } from '../../core/errors.js';
import { createSessionValidator, streamOrThrow, assertSafeHttpUrl } from '../../core/platform.js';
import { HAC_ENDPOINTS, ERROR_MESSAGES } from '../config/constants.js';

// HAC needs a custom link normalizer (drop a trailing /HomeAccess), so it does
// not use core's defaultFormatLink.
function formatLink(link) {
  if (!link) return undefined;
  link = link.trim();
  link = link.endsWith('/') ? link.slice(0, -1) : link;
  link = link.endsWith('/HomeAccess') ? link.slice(0, -11) : link;
  link = link + '/';
  link = link.startsWith('http') ? link : 'https://' + link;
  return assertSafeHttpUrl(link);
}

// A page is a logged-out page if it's the LogOn form or the district splash.
// Broad on purpose — powers auto-relogin on any dead-session GET.
function isSessionExpired(html) {
  if (typeof html !== 'string') return false;
  return html.includes('LogOn') ||
    html.includes('__RequestVerificationToken') ||
    html.includes(ERROR_MESSAGES.INVALID_LOGIN); // "Welcome to"
}

// Narrower than isSessionExpired: only the district splash marks a page invalid
// mid-fetch (data pages legitimately contain LogOn/token strings).
const checkSessionValidity = createSessionValidator(ERROR_MESSAGES.INVALID_LOGIN);

function isTestCredentials(username, password) {
  return username === process.env.TESTUSER && password === process.env.TESTPSSWD;
}

function getProductionCredentials() {
  return { username: process.env.USERNAME, password: process.env.PASSWORD };
}

function createLoginData(username = '', password = '', token = '') {
  return {
    '__RequestVerificationToken': token,
    'SCKTY00328510CustomEnabled': true,
    'SCKTY00436568CustomEnabled': true,
    'Database': 10,
    'VerificationOption': 'UsernamePassword',
    'LogOnDetails.UserName': username,
    'tempUN': '',
    'tempPW': '',
    'LogOnDetails.Password': password,
  };
}

/**
 * Inspect a HAC portal's LogOn page and report the district `<select>` a few
 * shared portals expose (one HAC host can front multiple districts, each a
 * `Database` option). The client calls this before showing the credentials form
 * so it can render a district picker only when one is actually needed.
 *
 * Returns `{ multiple, districts: [{ name, value }] }`. A portal with no select
 * (or a single option) reports `multiple: false` and the client just logs in.
 */
async function listDistricts(session, rawLink) {
  const link = formatLink(rawLink);
  if (!link) throw new ValidationError('link is required to list districts');

  const { data } = await session.get(`${link}${HAC_ENDPOINTS.LOGIN}`);
  const $ = cheerio.load(data);

  const districts = [];
  $('select').first().find('option').each(function () {
    const name = $(this).text().trim();
    const value = $(this).attr('value');
    if (name && value !== undefined) districts.push({ name, value });
  });

  return { multiple: districts.length > 1, districts };
}

/**
 * core's credentialsAuth contract: (session, loginData, progressTracker)
 *   -> { session, username } on success
 *   -> undefined if a streaming error was already sent.
 */
async function credentialsAuth(session, loginData, progressTracker) {
  let { username, password, district } = loginData;
  const link = formatLink(loginData.link);

  if (!link) throw new ValidationError('link is required for credentials login');
  if (!username || !password) {
    throw new ValidationError('username and password are required for credentials login');
  }

  if (isTestCredentials(username, password)) {
    const prod = getProductionCredentials();
    username = prod.username;
    password = prod.password;
  }

  const loginUrl = `${link}${HAC_ENDPOINTS.LOGIN}`;
  const hacLoginData = createLoginData(username, password);

  try {
    const { data: loginPage } = await session.get(loginUrl);
    const $ = cheerio.load(loginPage);
    const token = $("input[name='__RequestVerificationToken']").val();
    hacLoginData['__RequestVerificationToken'] = token;
    session.setVerificationToken(token);

    if (district && $('select').html()) {
      let found = false;
      $('select').find('option').each(function () {
        if ($(this).text().toLowerCase().trim() === district.toLowerCase().trim()) {
          hacLoginData.Database = $(this).attr('value');
          found = true;
          return false;
        }
      });
      if (!found) return streamOrThrow(progressTracker, 401, ERROR_MESSAGES.DISTRICT_NOT_FOUND);
    }

    const loginResult = await session.post(loginUrl, hacLoginData);
    if (loginResult.data.includes(ERROR_MESSAGES.INVALID_LOGIN)) {
      return streamOrThrow(progressTracker, 401, ERROR_MESSAGES.INVALID_USERNAME_PASSWORD);
    }

    session.hacData = loginResult.data; // splash HTML, read by data/info.js for district
    session.setLastValidationTime(Date.now());
    return { session, username };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return streamOrThrow(progressTracker, error.status || 401, error.message);
    }
    if (progressTracker && progressTracker.streaming) {
      progressTracker.error(500, `Login failed: ${error.message}`);
      return undefined;
    }
    throw new APIError(`Login failed: ${error.message}`);
  }
}

export {
  formatLink,
  isSessionExpired,
  checkSessionValidity,
  credentialsAuth,
  listDistricts,
  isTestCredentials,
  getProductionCredentials,
  createLoginData,
};
