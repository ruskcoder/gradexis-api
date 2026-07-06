/**
 * Teachers — reuses the gradebook (already fetched for grades) and reduces it to
 * class → teacher name + email, so no extra portal round-trip is needed.
 */

import { fetchGradebookHtml, parseGradebook } from './_gradebook.js';

async function teachers(session, link, options, progressTracker) {
  const html = await fetchGradebookHtml(session, link, progressTracker);
  progressTracker?.update?.(75, 'Parsing teachers');
  const { classes } = parseGradebook(html);

  const list = classes.map((c) => ({
    class: c.name,
    teacher: c.teacher || '',
    email: c.email || '',
  }));

  return { teachers: list };
}

export { teachers };
