/**
 * Student info — read straight off the home page header (name, district, school)
 * plus the current student picker. PowerSchool's guardian home carries no DOB /
 * counselor / grade, so those are returned blank (the apps already tolerate that).
 */

import { fetchHome, parseStudents, selectedStudentId } from './_grid.js';

async function info(session, link, options, progressTracker) {
  const { $ } = await fetchHome(session, link, options.studentId, progressTracker);
  progressTracker?.update?.(75, 'Parsing student info');

  const name = $('#firstlast').first().text().replace(/\s+/g, ' ').trim();
  // #print-school = "<district><br><span><school></span>"
  const printSchool = $('#print-school').first();
  const school = printSchool.find('span').first().text().trim();
  const district = printSchool.clone().children().remove().end().text().replace(/\s+/g, ' ').trim();

  return {
    name,
    district,
    school,
    dob: '',
    language: '',
    grade: '',
    counselor: '',
    students: parseStudents($),
    studentId: options.studentId || selectedStudentId($),
    link,
  };
}

export { info };
