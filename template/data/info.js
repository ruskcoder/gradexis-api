/**
 * Data functions have one shape: (session, link, options, progressTracker) => data.
 * Fetch with the authenticated `session`, parse, and return a plain object.
 * Core wraps it into { success:true, ...data, session } — never build that here.
 *
 * `session.username` holds the resolved username if you need it.
 */

import { ENDPOINTS } from '../config/constants.js';
import { checkSessionValidity } from '../auth/credentials.js';

async function info(session, link) {
  const page = await session.get(link + ENDPOINTS.INFO);
  checkSessionValidity(page);
  // TODO parse page.data
  return {
    name: '', grade: '', school: '', dob: '',
    counselor: '', language: '', district: '',
  };
}

export { info };
