import { ENDPOINTS } from '../config/constants.js';
import { checkSessionValidity } from '../auth/credentials.js';

async function schedule(session, link) {
  const page = await session.get(link + ENDPOINTS.SCHEDULE);
  checkSessionValidity(page);
  // TODO parse page.data
  return { schedule: [] };
}

export { schedule };
