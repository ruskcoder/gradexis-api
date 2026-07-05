import { ENDPOINTS } from '../config/constants.js';
import { checkSessionValidity } from '../auth/credentials.js';
import { ValidationError } from '../../core/errors.js';

// options.term selects the grading period; use progressTracker.update(pct, msg)
// for long fetches. Returns { term, termList, classes: [...] }.
async function classes(session, link, options, progressTracker) {
  const page = await session.get(link + ENDPOINTS.CLASSES);
  checkSessionValidity(page);
  // TODO parse page.data; honor options.term
  return { scoresIncluded: true, term: '', termList: [], classes: [] };
}

// options.class names the class to drill into.
async function singleClass(session, link, options, progressTracker) {
  if (!options.class) throw new ValidationError('Missing required parameters (class)');
  const { classes: list, term, termList } = await classes(session, link, options, progressTracker);
  const current = list.find((c) => c.name === options.class);
  if (!current) throw new ValidationError('Class not found');
  return { scoresIncluded: true, term, termList, class: current };
}

export { classes, singleClass };
