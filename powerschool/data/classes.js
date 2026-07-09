/**
 * Classes overview + single-class assignment detail.
 *
 * /classes       reads the home grid = per-term AVERAGES only (no assignments)
 *                -> scoresIncluded: false.
 * /single-class  additionally opens the term's scores.html page to read the
 *                sectionid, then POSTs ws/xte/assignment/lookup with the EXACT
 *                section id, student id and begin/end dates taken straight from
 *                the grid's own href — the tuple PowerSchool requires for a valid
 *                assignment response -> scoresIncluded: true.
 *
 * PowerSchool's term columns cascade (P1 rolls into C1, C-terms into the year).
 * `termTree` reconstructs that nesting from each column's own begin/end dates, so
 * the UI can render as many levels of subtabs as the district actually defines;
 * `termList` carries the flat set of every column.
 */

import { ValidationError, APIError } from '../../core/errors.js';
import { ENDPOINTS, WS_HEADERS, ERROR_MESSAGES } from '../config/constants.js';
import { fetchHome, parseStudents, selectedStudentId, parseGradebook, publicClass } from './_grid.js';

/** Common { students, studentId } envelope so the UI can always show the picker. */
function studentContext($, options) {
  const students = parseStudents($);
  const studentId = options.studentId || selectedStudentId($);
  return { students, studentId };
}

async function classes(session, link, options, progressTracker) {
  const { $ } = await fetchHome(session, link, options.studentId, progressTracker);
  progressTracker?.update?.(75, 'Parsing grades');
  const { termList, termTree, hasSubterms, term, currentTerms, classes } = parseGradebook($, options);
  const list = classes.map((c) => publicClass({ ...c, currentTerm: term }));

  return {
    scoresIncluded: false,
    termsIncluded: true,
    hasSubterms,
    termList,
    termTree,
    term,
    currentTerms,
    ...studentContext($, options),
    classes: list,
  };
}

/** Format an M/D/Y date string as PowerSchool's zero-stripped YYYY-M-D. */
function toWsDate(mdY) {
  const [m, d, y] = mdY.split('/');
  return `${y}-${Number(m)}-${Number(d)}`;
}

/** Reformat a "YYYY-MM-DD" assignment date as "M/D/YYYY". */
function fromIso(iso) {
  const [y, m, d] = (iso || '').split('-');
  if (!y || !m || !d) return '';
  return `${Number(m)}/${Number(d)}/${y}`;
}

/**
 * Fetch and parse the assignment list for one class/term.
 * `href` is the grid's scores.html link (carries frn/begdate/enddate/fg).
 */
async function fetchDetail(session, link, href, studentId, progressTracker) {
  progressTracker?.update?.(60, 'Getting scores');
  const scoresUrl = link + 'guardian/' + href.replace(/^\/?guardian\//, '');
  const page = (await session.get(scoresUrl)).data;

  const secMatch = /data-sectionid="(\d+)"/.exec(typeof page === 'string' ? page : '');
  if (!secMatch) throw new APIError(ERROR_MESSAGES.DETAIL_FAILED, 400);
  const sectionId = Number(secMatch[1]);

  const beg = /begdate=([\d/]+)/.exec(href);
  const end = /enddate=([\d/]+)/.exec(href);
  if (!beg || !end) throw new APIError(ERROR_MESSAGES.DETAIL_FAILED, 400);

  const body = {
    section_ids: [sectionId],
    student_ids: studentId ? [Number(studentId)] : [],
    start_date: toWsDate(beg[1]),
    end_date: toWsDate(end[1]),
  };

  progressTracker?.update?.(80, 'Loading assignments');
  const data = (await session.post(
    `${link}${ENDPOINTS.ASSIGNMENT_LOOKUP}?_=${Date.now()}`,
    body,
    { headers: { ...WS_HEADERS, referer: scoresUrl } }
  )).data;

  return parseAssignments(Array.isArray(data) ? data : []);
}

/** Turn the raw assignment JSON into { scores, categories, averageType }. */
function parseAssignments(data) {
  const scores = [];
  const categories = {};
  let averageType = 'percentwise';

  for (const item of data) {
    const assignment = item._assignmentsections?.[0];
    if (!assignment) continue;
    const score = assignment._assignmentscores || [];
    const s0 = score[0];

    const badges = [];
    if (!assignment.iscountedinfinalgrade) badges.push('exempt');
    if (s0) {
      if (s0.isexempt) badges.push('exempt');
      if (s0.ismissing) badges.push('missing');
      if (s0.islate) badges.push('late');
      if (s0.isabsent) badges.push('absent');
      if (s0.isincomplete) badges.push('incomplete');
    }

    const dueDate = fromIso(assignment.duedate);
    const category = assignment._assignmentcategoryassociations?.[0]?._teachercategory?.name || '';
    // scorelettergrade carries the letter when a class grades by letter, the
    // number otherwise — surface whichever the teacher entered.
    const displayScore = s0 ? (s0.scorelettergrade ?? s0.scorepoints ?? '') : '';

    const current = {
      name: assignment.name,
      category,
      percentage: s0 && s0.scorepercent != null ? `${s0.scorepercent}%` : '0%',
      score: displayScore === null ? '' : String(displayScore),
      scorePoints: s0?.scorepoints ?? '',
      totalPoints: assignment.scoreentrypoints,
      weight: assignment.weight,
      weightedTotalPoints: assignment.totalpointvalue,
      weightedScore: s0 && s0.scorepoints != null
        ? parseFloat((s0.scorepoints * assignment.weight).toPrecision(4))
        : '',
      dateDue: dueDate,
      dateAssigned: dueDate,
      badges,
    };
    if (current.weight != 1) averageType = 'scorewise';

    if (s0 && s0.scorepoints != null && !badges.includes('exempt')) {
      const cat = categories[category] || { studentsPoints: 0, maximumPoints: 0 };
      cat.studentsPoints += Number(current.weightedScore) || 0;
      cat.maximumPoints += Number(current.weightedTotalPoints) || 0;
      categories[category] = cat;
    }
    scores.push(current);
  }

  const catNames = Object.keys(categories);
  for (const name of catNames) {
    const weight = 100 / catNames.length;
    const percent = categories[name].maximumPoints
      ? (categories[name].studentsPoints / categories[name].maximumPoints) * 100
      : 0;
    categories[name].percent = `${percent}%`;
    categories[name].categoryWeight = weight;
    categories[name].categoryPoints = (percent / 100) * weight;
  }

  return { scores, categories, averageType };
}

async function singleClass(session, link, options, progressTracker) {
  const courseFilter = options.course;
  const nameFilter = options.class;
  if (!courseFilter && !nameFilter) {
    throw new ValidationError('Missing required parameters (class or course)');
  }

  const { $ } = await fetchHome(session, link, options.studentId, progressTracker);
  const { termList, termTree, hasSubterms, term, currentTerms, classes } = parseGradebook($, options);

  let current = null;
  if (courseFilter) current = classes.find((c) => c.course === courseFilter);
  if (!current && nameFilter) current = classes.find((c) => c.name === nameFilter);
  if (!current) throw new ValidationError(ERROR_MESSAGES.CLASS_NOT_FOUND);

  const requestedTerm = options.term && termList.includes(options.term) ? options.term : term;
  const href = current._hrefs[requestedTerm];
  const ctx = studentContext($, options);

  let detail = { scores: [], categories: {}, averageType: 'percentwise' };
  let scoresIncluded = false;
  if (href) {
    try {
      detail = await fetchDetail(session, link, href, ctx.studentId, progressTracker);
      scoresIncluded = true;
    } catch (e) {
      console.warn('powerschool singleClass detail failed:', e && e.message);
    }
  }

  const merged = {
    course: current.course,
    name: current.name,
    period: current.period,
    teacher: current.teacher,
    email: current.email,
    room: current.room,
    average: current.averages[requestedTerm] || '',
    averageType: detail.averageType,
    scores: detail.scores,
    categories: detail.categories,
  };

  return {
    scoresIncluded,
    termsIncluded: true,
    hasSubterms,
    termList,
    termTree,
    term: requestedTerm,
    currentTerms,
    ...ctx,
    class: merged,
  };
}

export { classes, singleClass };
