const cheerio = require('cheerio');
const { HAC_ENDPOINTS, ERROR_MESSAGES, MONTH_INPUTS, MONTH_NAMES } = require('../config/constants');
const { ValidationError } = require('../middleware/errors');
const { createTermData, createMonthData, splitClassHeaderAndCourseName } = require('../utils/validation');
const { checkSessionValidity } = require('./authentication');

async function fetchClassesData(session, link, term, progressTracker) {
    const scoresResponse = await session.get(link + HAC_ENDPOINTS.ASSIGNMENTS);
    checkSessionValidity(scoresResponse);

    let $ = cheerio.load(scoresResponse.data);

    if (term) {
        progressTracker.update(65, 'Going to term');

        const viewstate = $('input[name="__VIEWSTATE"]').val();
        const eventvalidation = $('input[name="__EVENTVALIDATION"]').val();
        const year = $('select[name="ctl00$plnMain$ddlReportCardRuns"] option').eq(1).val().substring(2);

        const termData = createTermData(`${term}-${year}`);
        termData["__VIEWSTATE"] = viewstate;
        termData["__EVENTVALIDATION"] = eventvalidation;

        const termResponse = await session.post(link + HAC_ENDPOINTS.ASSIGNMENTS, termData);
        $ = cheerio.load(termResponse.data);
    }

    progressTracker.update(80, 'Organizing data');

    const scheduleResponse = await session.get(link + HAC_ENDPOINTS.CLASSES);
    const $$ = cheerio.load(scheduleResponse.data);

    return { assignmentsPage: $, schedulePage: $$ };
}

function extractClassList(assignmentsPage) {
    const classes = [];
    assignmentsPage('.AssignmentClass .sg-header .sg-header-heading:not(.sg-right)').each(function () {
        classes.push(assignmentsPage(this).text().trim());
    });

    return classes.map(c => {
        const { classHeader } = splitClassHeaderAndCourseName(c);
        return classHeader.trim();
    });
}

function extractTermInfo(assignmentsPage) {
    const term = assignmentsPage('#plnMain_ddlReportCardRuns').find('option[selected="selected"]').text().trim();
    const termList = assignmentsPage('#plnMain_ddlReportCardRuns').find('option')
        .toArray()
        .map(e => assignmentsPage(e).text().trim())
        .slice(1);

    return { term, termList };
}

function extractScheduleData(schedulePage, courses) {
    const scheduleData = {};

    schedulePage('.sg-asp-table-data-row').each(function () {
        const courseText = schedulePage(this).children().first().text().trim();

        if (courses.includes(courseText)) {
            scheduleData[courseText] = {
                averageType: "categorywise",
                course: courseText,
                name: schedulePage(this).children().eq(1).find('a').text().trim(),
                period: schedulePage(this).children().eq(2).text().trim().substring(0, 1),
                teacher: schedulePage(this).children().eq(3).text().trim(),
                room: schedulePage(this).children().eq(4).text().trim(),
            };
        }
    });

    return scheduleData;
}

function extractAssignmentData(assignmentsPage, scheduleData) {
    assignmentsPage('.AssignmentClass').each(function () {
        const classHeader = splitClassHeaderAndCourseName(
            assignmentsPage(this).find('.sg-header .sg-header-heading').text().trim()
        ).classHeader.trim();

        if (!scheduleData[classHeader]) {
            scheduleData[classHeader] = {
                course: classHeader,
                name: splitClassHeaderAndCourseName(
                    assignmentsPage(this).find('.sg-header .sg-header-heading').eq(0).text().trim()
                ).courseName.trim(),
                period: "dropped",
            };
        }

        const averageText = assignmentsPage(this).find('.sg-header .sg-header-heading.sg-right').text().trim().split(' ').pop();
        scheduleData[classHeader].average = averageText.endsWith("%") ?
            averageText.slice(0, -1) : averageText;

        scheduleData[classHeader].scores = [];
        assignmentsPage(this).find('.sg-content-grid > .sg-asp-table > tbody > .sg-asp-table-data-row').each(function () {
            const assignment = {
                name: assignmentsPage(this).children().eq(2).children().first().text().trim(),
                category: assignmentsPage(this).children().eq(3).text().trim(),
                percentage: assignmentsPage(this).children().eq(9).text().trim(),
                score: assignmentsPage(this).children().eq(4).text().trim(),
                totalPoints: parseFloat(assignmentsPage(this).children().eq(5).text().trim()) || "",
                weight: parseFloat(assignmentsPage(this).children().eq(6).text().trim()) || "",
                weightedScore: parseFloat(assignmentsPage(this).children().eq(7).text().trim()) || "",
                weightedTotalPoints: parseFloat(assignmentsPage(this).children().eq(8).text().trim()) || "",
                dateDue: assignmentsPage(this).children().eq(0).text().trim(),
                dateAssigned: assignmentsPage(this).children().eq(1).text().trim(),
                badges: []
            };

            if (assignment.score && assignment.score.includes('Missing')) {
                assignment.badges.push("missing");
                assignment.score = 0;
            }
            if (assignment.score && assignment.score.includes('Exempt')) {
                assignment.badges.push("exempt");
                assignment.score = "";
            }

            assignment.score = parseFloat(assignment.score) || assignment.score;
            scheduleData[classHeader].scores.push(assignment);
        });

        scheduleData[classHeader].categories = {};
        assignmentsPage(this).find('.sg-content-grid .sg-asp-table-group tr.sg-asp-table-data-row').each(function () {
            const categoryName = assignmentsPage(this).children().eq(0).text().trim();
            scheduleData[classHeader].categories[categoryName] = {
                studentsPoints: assignmentsPage(this).children().eq(1).text().trim(),
                maximumPoints: assignmentsPage(this).children().eq(2).text().trim(),
                percent: assignmentsPage(this).children().eq(3).text().trim(),
                categoryWeight: assignmentsPage(this).children().eq(4).text().trim(),
                categoryPoints: assignmentsPage(this).children().eq(5).text().trim(),
            };
        });
    });

    return scheduleData;
}

function processAttendanceDate(dateQuery) {
    if (!dateQuery) return null;

    const [reqMonth, reqYear] = dateQuery.split('-');
    const monthIndex = MONTH_INPUTS[reqMonth.toLowerCase()];

    if (monthIndex === undefined) {
        throw new ValidationError(ERROR_MESSAGES.INVALID_MONTH);
    }

    return { monthIndex, reqYear: parseInt(reqYear) };
}

function calculateMonthCode(year, monthIndex) {
    const jan1 = new Date(2000, 0, 1);
    const targetDate = new Date(year, monthIndex, 1);
    return Math.floor((targetDate - jan1) / 86400000);
}

async function navigateToMonth(session, link, targetMonthCode, progressTracker) {
    const maxLoops = 15;
    let loops = 0;

    let currentPage = await session.get(link + HAC_ENDPOINTS.ATTENDANCE);
    let $ = cheerio.load(currentPage.data);

    while (loops < maxLoops) {
        loops++;

        const prevElement = $('a[title="Go to the previous month"]');
        const nextElement = $('a[title="Go to the next month"]');

        let prev, next;

        if (!nextElement.text()) {
            prev = parseInt(prevElement.attr('href').split('\'')[3].slice(1));
            if (targetMonthCode > prev) return $; // Month not available
        } else if (!prevElement.text()) {
            next = parseInt(nextElement.attr('href').split('\'')[3].slice(1));
            if (targetMonthCode < next) return $; // Month not available
        } else {
            prev = parseInt(prevElement.attr('href').split('\'')[3].slice(1));
            next = parseInt(nextElement.attr('href').split('\'')[3].slice(1));
        }

        const monthData = createMonthData(
            $('input[name="__VIEWSTATE"]').val(),
            $('input[name="__EVENTVALIDATION"]').val()
        );

        if (targetMonthCode <= prev) {
            monthData['__EVENTARGUMENT'] = `V${prev}`;
        } else if (targetMonthCode >= next) {
            monthData['__EVENTARGUMENT'] = `V${next}`;
        } else {
            break; // We're at the right month
        }

        const response = await session.post(link + HAC_ENDPOINTS.ATTENDANCE, monthData);
        $ = cheerio.load(response.data);
    }

    return $;
}

function extractAttendanceData($) {
    const events = {};
    const colorKey = {};

    $('.sg-clearfix div').each(function () {
        const styleAttr = $(this).children().eq(0).attr('style');
        if (styleAttr) {
            const color = styleAttr.substring(18).split(';')[0].toLowerCase();
            colorKey[color] = $(this).children().eq(1).text();
        }
    });

    const monthDisplay = $('#plnMain_cldAttendance > tbody > tr:nth-child(1) > td > table > tbody > tr > td:nth-child(2)').text().trim();

    $('.sg-asp-calendar tr').slice(2).find('td').each(function (index) {
        if (![0, 6].includes(index % 7)) { // Skip weekends
            const dateText = $(this).text() + " " + monthDisplay;
            const dateParts = dateText.split(' ');
            const month = new Date(dateParts[1] + ' 1, 2000').getMonth() + 1;
            const formattedDate = `${month}/${dateParts[0]}/${dateParts[2].slice(-2)}`;

            if ($(this).attr('title')) {
                events[formattedDate] = {
                    event: $(this).attr('title').split('\n')[1],
                    color: $(this).attr('bgcolor').toLowerCase()
                };
            } else if ($(this).attr('style')) {
                const color = $(this).attr('style').substring(17).split(';')[0].toLowerCase();
                if (colorKey[color]) {
                    events[formattedDate] = {
                        event: colorKey[color],
                        color: color
                    };
                }
            }
        }
    });

    return {
        month: monthDisplay.split(' ')[0],
        year: monthDisplay.split(' ')[1],
        events
    };
}

async function extractProgressReports(session, progressReportUrl, $) {
    const options = $('#plnMain_ddlIPRDates option').toArray().reverse();
    const reports = [];

    for (const option of options) {
        const value = $(option).attr('value');
        const selectedText = $(option).text().trim();

        const formData = {
            __EVENTTARGET: 'ctl00$plnMain$ddlIPRDates',
            __EVENTARGUMENT: '',
            __VIEWSTATE: $('input[name="__VIEWSTATE"]').val(),
            __EVENTVALIDATION: $('input[name="__EVENTVALIDATION"]').val(),
            'ctl00$plnMain$ddlIPRDates': value,
        };

        const { data: updatedPage } = await session.post(progressReportUrl, formData);
        const $$ = cheerio.load(updatedPage);

        const report = [];

        $$('#plnMain_dgIPR .sg-asp-table-data-row').each(function () {
            const courseData = {
                course: $$(this).children().eq(0).text().trim(),
                description: $$(this).children().eq(1).text().trim(),
                period: $$(this).children().eq(2).text().trim(),
                teacher: $$(this).children().eq(3).text().trim(),
                room: $$(this).children().eq(4).text().trim(),
                grade: $$(this).children().eq(5).text().trim(),
                com1: $$(this).children().eq(6).text().trim(),
                com2: $$(this).children().eq(7).text().trim(),
                com3: $$(this).children().eq(8).text().trim(),
                com4: $$(this).children().eq(9).text().trim(),
                com5: $$(this).children().eq(10).text().trim(),
            };
            report.push(courseData);
        });

        const comments = [];
        $$('.sg-asp-table[id*="CommentLegend"] tr.sg-asp-table-data-row').each(function () {
            comments.push({
                comment: $$(this).children().eq(0).text().trim(),
                commentDescription: $$(this).children().eq(1).text().trim(),
            });
        });

        report.push({ comments });
        reports.push({ date: selectedText, report });
    }

    return reports;
}

async function extractReportCards(session, reportCardUrl, $) {
    const options = $('#plnMain_ddlRCRuns option').toArray().reverse();
    let reload = options.length > 0;

    if (!reload) {
        options.push(""); // Handle case with no options
    }

    const reports = [];

    for (const option of options) {
        let selectedText, $$;

        if (reload) {
            const value = $(option).attr('value');
            selectedText = $(option).text().trim();

            const formData = {
                __EVENTTARGET: 'ctl00$plnMain$ddlRCRuns',
                __EVENTARGUMENT: '',
                __VIEWSTATE: $('input[name="__VIEWSTATE"]').val(),
                __EVENTVALIDATION: $('input[name="__EVENTVALIDATION"]').val(),
                'ctl00$plnMain$ddlRCRuns': value,
            };

            const { data: updatedPage } = await session.post(reportCardUrl, formData);
            $$ = cheerio.load(updatedPage);
        } else {
            selectedText = "1";
            $$ = $;
        }

        const report = [];

        $$('.sg-asp-table-data-row').each(function () {
            const courseData = {
                course: $$(this).children().eq(0).text().trim(),
                description: $$(this).children().eq(1).text().trim(),
                period: $$(this).children().eq(2).text().trim(),
                teacher: $$(this).children().eq(3).text().trim(),
                room: $$(this).children().eq(4).text().trim(),
                att_credit: $$(this).children().eq(5).text().trim(),
                ern_credit: $$(this).children().eq(6).text().trim(),
                first: $$(this).children().eq(7).text().trim(),
                second: $$(this).children().eq(8).text().trim(),
                third: $$(this).children().eq(9).text().trim(),
                exam1: $$(this).children().eq(10).text().trim(),
                sem1: $$(this).children().eq(11).text().trim(),
                fourth: $$(this).children().eq(12).text().trim(),
                fifth: $$(this).children().eq(13).text().trim(),
                sixth: $$(this).children().eq(14).text().trim(),
                exam2: $$(this).children().eq(15).text().trim(),
                sem2: $$(this).children().eq(16).text().trim(),
                eoy: $$(this).children().eq(17).text().trim(),
                cnd1: $$(this).children().eq(18).text().trim(),
                cnd2: $$(this).children().eq(19).text().trim(),
                cnd3: $$(this).children().eq(20).text().trim(),
                cnd4: $$(this).children().eq(21).text().trim(),
                cnd5: $$(this).children().eq(22).text().trim(),
                cnd6: $$(this).children().eq(23).text().trim(),
                c1: $$(this).children().eq(24).text().trim(),
                c2: $$(this).children().eq(25).text().trim(),
                c3: $$(this).children().eq(26).text().trim(),
                c4: $$(this).children().eq(27).text().trim(),
                c5: $$(this).children().eq(28).text().trim(),
                exda: $$(this).children().eq(29).text().trim(),
                uexa: $$(this).children().eq(30).text().trim(),
                exdt: $$(this).children().eq(31).text().trim(),
                uext: $$(this).children().eq(32).text().trim(),
            };
            report.push(courseData);
        });

        const totalEarnedCredit = $$("[id='plnMain_lblTotalEarnedCredit']").text().trim();
        report.push({ totalEarnedCredit });

        const comments = [];
        $$('.sg-asp-table[id="plnMain_dgCommentLegend"] tr:not(.sg-asp-table-header-row)').each(function () {
            comments.push({
                comment: $$(this).children().eq(0).text().trim(),
                commentDescription: $$(this).children().eq(1).text().trim(),
            });
        });

        report.push({ comments });
        reports.push({ reportCardRun: selectedText, report });
    }

    return reports;
}

function extractTranscriptData($) {
    const transcript = {};

    $('td.sg-transcript-group').each((index, element) => {
        const semester = {};

        $(element).find('table > tbody > tr > td > span').each((i, el) => {
            const id = $(el).attr('id');
            if (id.includes('YearValue')) {
                semester.year = $(el).text().trim();
            } else if (id.includes('GroupValue')) {
                semester.semester = $(el).text().trim();
            } else if (id.includes('GradeValue')) {
                semester.grade = $(el).text().trim();
            } else if (id.includes('BuildingValue')) {
                semester.school = $(el).text().trim();
            }
        });

        const courseData = [];
        $(element).find('table:nth-child(2) > tbody > tr').each((i, el) => {
            if ($(el).hasClass('sg-asp-table-header-row') || $(el).hasClass('sg-asp-table-data-row')) {
                const rowData = [];
                $(el).find('td').each((j, cell) => {
                    rowData.push($(cell).text().trim());
                });
                courseData.push(rowData);
            }
        });
        semester.data = courseData;

        $(element).find('table:nth-child(3) > tbody > tr > td > label').each((i, el) => {
            if ($(el).attr('id').includes('CreditValue')) {
                semester.credits = $(el).text().trim();
            }
        });

        const title = `${semester.year} - Semester ${semester.semester}`;
        transcript[title] = semester;
    });

    $('#plnMain_rpTranscriptGroup_tblCumGPAInfo tbody > tr.sg-asp-table-data-row').each((index, element) => {
        let text = '';
        let value = '';

        $(element).find('td > span').each((i, el) => {
            const id = $(el).attr('id');
            if (id.includes('GPADescr')) {
                text = $(el).text().trim();
            }
            if (id.includes('GPACum')) {
                value = $(el).text().trim();
            }
            if (id.includes('GPARank')) {
                transcript.rank = $(el).text().trim();
            }
            if (id.includes('GPAQuartile')) {
                transcript.quartile = $(el).text().trim();
            }
        });

        if (text) {
            transcript[text] = value;
        }
    });

    return transcript;
}

module.exports = {
    fetchClassesData,
    extractClassList,
    extractTermInfo,
    extractScheduleData,
    extractAssignmentData,
    processAttendanceDate,
    calculateMonthCode,
    navigateToMonth,
    extractAttendanceData,
    extractProgressReports,
    extractReportCards,
    extractTranscriptData
};

