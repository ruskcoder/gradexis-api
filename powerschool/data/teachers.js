/**
 * Teachers — reduces the already-parsed home grid to class -> teacher + email,
 * so no extra portal round-trip is needed.
 */

import { fetchHome, parseGradebook, parseStudents, selectedStudentId } from './_grid.js';

async function teachers(session, link, options, progressTracker) {
  const { $ } = await fetchHome(session, link, options.studentId, progressTracker);
  progressTracker?.update?.(75, 'Parsing teachers');
  const { classes } = parseGradebook($, options);

  const list = classes.map((c) => ({
    class: c.name,
    teacher: c.teacher || '',
    email: c.email || '',
    room: c.room || '',
  }));

  return {
    teachers: list,
    students: parseStudents($),
    studentId: options.studentId || selectedStudentId($),
  };
}

export { teachers };
