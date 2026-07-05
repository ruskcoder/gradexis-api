/**
 * Platform-specific constants. Rename/trim to fit your portal.
 */

// Error strings the portal returns on its HTML pages, used to detect a
// logged-out / bad-password response rather than real data.
const ERROR_MESSAGES = {
    INVALID_LOGIN: 'Invalid username or password',
    INVALID_SESSION: 'Your session has expired',
};

// Paths appended to the user's `link` (portal base URL) to reach each page.
const ENDPOINTS = {
    LOGIN: 'login',
    HOME: '',
    INFO: 'student/info',
    CLASSES: 'student/classes',
    SCHEDULE: 'student/schedule',
    ATTENDANCE: 'student/attendance',
    TEACHERS: 'student/teachers',
    REPORT_CARDS: 'student/reportcards',
    PROGRESS_REPORTS: 'student/progress',
    TRANSCRIPT: 'student/transcript',
};

export { ERROR_MESSAGES, ENDPOINTS };
