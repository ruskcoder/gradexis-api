import { ENDPOINTS } from '../config/constants.js';
import { checkSessionValidity } from '../auth/credentials.js';

async function ipr(session, link) {
  const page = await session.get(link + ENDPOINTS.PROGRESS_REPORTS);
  checkSessionValidity(page);
  // TODO parse page.data
  return { progressReports: [] };
}

async function reportCard(session, link) {
  const page = await session.get(link + ENDPOINTS.REPORT_CARDS);
  checkSessionValidity(page);
  // TODO parse page.data
  return { reportCards: [] };
}

async function transcript(session, link) {
  const page = await session.get(link + ENDPOINTS.TRANSCRIPT);
  checkSessionValidity(page);
  // TODO parse page.data
  return { transcriptData: {} };
}

export { ipr, reportCard, transcript };
