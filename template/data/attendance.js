import { ENDPOINTS } from '../config/constants.js';
import { checkSessionValidity } from '../auth/credentials.js';

// options.date optionally selects a month, e.g. "sep-2025".
async function attendance(session, link, options) {
  const page = await session.get(link + ENDPOINTS.ATTENDANCE);
  checkSessionValidity(page);
  // TODO parse page.data; honor options.date
  return { events: {} };
}

export { attendance };
