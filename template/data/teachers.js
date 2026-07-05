import { ENDPOINTS } from '../config/constants.js';
import { checkSessionValidity } from '../auth/credentials.js';

async function teachers(session, link) {
  const page = await session.get(link + ENDPOINTS.TEACHERS);
  checkSessionValidity(page);
  // TODO parse page.data
  return { teachers: [] }; // [{ class, teacher, email }, ...]
}

export { teachers };
