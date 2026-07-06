/**
 * Bell schedule.
 *
 * Skyward legacy (Skyport / Family Access) has no dedicated student-facing bell
 * schedule endpoint — the captured HAR never hits one. When a district's
 * schedule page happens to carry period meeting times we surface them; otherwise
 * we return the standard 404 the apps already handle for portals without it.
 */

import * as cheerio from 'cheerio';
import { SKYWARD_ENDPOINTS, ERROR_MESSAGES } from '../config/constants.js';
import { skywardTokens, sessionId, checkSessionValidity } from '../auth/credentials.js';
import { APIError, HTTP_STATUS } from '../../core/errors.js';

const TIME_RE = /\b(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*[-–]\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])\b/;

async function bellSchedule(session, link, options, progressTracker) {
  const tokens = skywardTokens(session);
  const body = new URLSearchParams({
    encses: tokens.encses || '',
    sessionid: sessionId(tokens),
  }).toString();

  const res = await session.post(link + SKYWARD_ENDPOINTS.SCHEDULE, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: link + SKYWARD_ENDPOINTS.HOME,
    },
  });
  checkSessionValidity(res);

  const $ = cheerio.load(res.data);
  const periods = [];
  $('div[id^="MATRIX_scheduleGrid_"] table.schedule tbody > tr').each(function () {
    const period = $(this).find('td.period').first().text().replace(/Period\s*/i, '').trim();
    const rowTime = $(this).text().match(TIME_RE);
    if (period && rowTime) {
      periods.push({ period, startTime: rowTime[1].trim(), endTime: rowTime[2].trim() });
    }
  });

  if (periods.length === 0) {
    throw new APIError(ERROR_MESSAGES.BELL_SCHEDULE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  return { bellSchedule: periods };
}

export { bellSchedule };
