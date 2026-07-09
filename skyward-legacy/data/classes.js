/**
 * Classes overview + single-class detail.
 *
 * Skyward splits these across two requests:
 *   - /classes        the gradebook grid = per-term AVERAGES only
 *                     (no assignments) -> scoresIncluded: false.
 *   - /single-class   the per-class "grade info" dialog = assignment scores +
 *                     category breakdown for one term -> scoresIncluded: true.
 *
 * Term model for the UI:
 *   termList  = flat list of every column, in order (PR1, PR2, 1ST, ..., SM2)
 *   termTree  = the cascade as a nested forest [{ label, children }], coarsest
 *               columns as roots -> the UI renders one subtab bar per level, to
 *               whatever depth the district defines (PR -> term -> semester).
 *   averages  = every column keyed by its label, so the UI shows whichever
 *               tab/subtab is selected.
 * options.term (a term OR subterm label) drives which detail bucket we fetch.
 * A full-year class spans two Skyward sections; `termCourse` (internal) maps each
 * term to the section that owns it so the detail request targets the right one.
 */

import { ValidationError } from '../../core/errors.js';
import { fetchGradebookHtml, parseGradebook, fetchClassDetail } from './_gradebook.js';

// Drop the internal routing map before returning a class to the client.
function publicClass(cls) {
  const { termCourse, ...rest } = cls;
  return rest;
}

async function classes(session, link, options, progressTracker) {
  const html = await fetchGradebookHtml(session, link, progressTracker);
  progressTracker?.update?.(75, 'Parsing grades');
  const { hasSubterms, termList, termTree, term, currentTerms, classes } = parseGradebook(html);
  return {
    scoresIncluded: false,
    termsIncluded: true,
    hasSubterms,
    termList,
    termTree,
    term,
    currentTerms,
    classes: classes.map(publicClass),
  };
}

async function singleClass(session, link, options, progressTracker) {
  const courseFilter = options.course;
  const nameFilter = options.class;
  if (!courseFilter && !nameFilter) {
    throw new ValidationError('Missing required parameters (class or course)');
  }

  const html = await fetchGradebookHtml(session, link, progressTracker);
  const { hasSubterms, termList, termTree, term, currentTerms, classes } = parseGradebook(html);

  let current = null;
  if (courseFilter) {
    current = classes.find(
      (c) => c.course === courseFilter || (c.sections || []).includes(courseFilter)
    );
  }
  if (!current && nameFilter) current = classes.find((c) => c.name === nameFilter);
  if (!current) throw new ValidationError('Class not found');

  const requestedTerm = options.term || term;
  // Route to whichever section (fall/spring) actually owns the requested term.
  const detailCourse = current.termCourse?.[requestedTerm] || current.course;

  let merged = publicClass(current);
  let scoresIncluded = false;
  try {
    const detail = await fetchClassDetail(session, link, detailCourse, requestedTerm, progressTracker);
    if (detail && detail.class) {
      merged = {
        ...merged,
        average: detail.class.average || current.averages?.[requestedTerm] || '',
        scores: detail.class.scores || [],
        categories: detail.class.categories || {},
      };
      if (detail.multipleGroups && detail.class.groups) {
        merged.groups = detail.class.groups;
        merged.multipleGroups = true;
      }
      scoresIncluded = detail.scoresIncluded !== false;
    }
  } catch (e) {
    console.warn('skyward singleClass: detail fetch failed:', e && e.message);
  }

  return {
    scoresIncluded,
    termsIncluded: true,
    hasSubterms,
    termList,
    termTree,
    term: requestedTerm,
    currentTerms,
    class: merged,
  };
}

export { classes, singleClass };
