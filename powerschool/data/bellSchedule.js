/**
 * Bell schedule — derived from the same myschedule.html matrix as /schedule.
 *
 * PowerSchool has no dedicated bell-schedule page, but the schedule matrix dates
 * every class block, so we can group blocks by weekday and emit the ordered
 * period times for each day (this district runs an A/B block rotation, so the
 * period times differ per weekday — hence the day grouping).
 */

import { APIError, HTTP_STATUS } from '../../core/errors.js';
import { ERROR_MESSAGES } from '../config/constants.js';
import { parseStudents, selectedStudentId } from './_grid.js';
import { fetchScheduleBlocks } from './schedule.js';

function toMinutes(t) {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(t || '');
  if (!m) return Number.MAX_SAFE_INTEGER;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

async function bellSchedule(session, link, options, progressTracker) {
  const { $, blocks } = await fetchScheduleBlocks(session, link, options, progressTracker);
  progressTracker?.update?.(80, 'Parsing bell schedule');

  // Group blocks by weekday, dedupe identical period slots, order by start time.
  // A bell schedule is about TIMINGS only — deliberately drop course/room so it
  // can be reused as a generic period-time template (the UI adds it to the user's
  // bell schedules without leaking this student's specific classes).
  const byDay = new Map();
  for (const b of blocks) {
    if (!b.day || !b.startTime) continue;
    const list = byDay.get(b.day) || [];
    if (!list.some((p) => p.startTime === b.startTime && p.endTime === b.endTime)) {
      list.push({ startTime: b.startTime, endTime: b.endTime });
    }
    byDay.set(b.day, list);
  }

  const order = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const days = [...byDay.entries()]
    .sort((a, b) => order[a[0]] - order[b[0]])
    .map(([day, periods]) => ({
      day,
      periods: periods
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
        .map((p, i) => ({ period: String(i + 1), startTime: p.startTime, endTime: p.endTime })),
    }));

  if (days.length === 0) {
    throw new APIError(ERROR_MESSAGES.BELL_SCHEDULE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  return {
    bellSchedule: days,
    students: parseStudents($),
    studentId: options.studentId || selectedStudentId($),
  };
}

export { bellSchedule };
