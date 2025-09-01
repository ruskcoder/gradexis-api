const express = require('express');
const cheerio = require('cheerio');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateUser, checkSessionValidity } = require('../services/authentication');
const { createSuccessResponse } = require('../utils/session');
const ProgressTracker = require('../utils/progressTracker');
const { HAC_ENDPOINTS, MONTH_NAMES } = require('../config/constants');
const {
    processAttendanceDate,
    calculateMonthCode,
    navigateToMonth,
    extractAttendanceData
} = require('../services/dataExtraction');

const router = express.Router();

router.get('/attendance', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    
    const authResult = await authenticateUser(req, progressTracker);
    

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;

    // Process date query if provided
    let dateInfo = null;
    if (req.query.date) {
        dateInfo = processAttendanceDate(req.query.date);
    }

    // Get initial attendance page
    const attendanceResponse = await session.get(link + HAC_ENDPOINTS.ATTENDANCE);
    checkSessionValidity(attendanceResponse);

    let $ = cheerio.load(attendanceResponse.data);

    // Navigate to specific month if requested
    if (dateInfo) {
        const targetMonthCode = calculateMonthCode(dateInfo.reqYear, dateInfo.monthIndex);

        // Check if we're already on the right month
        if (!attendanceResponse.data.includes(MONTH_NAMES[dateInfo.monthIndex])) {
            $ = await navigateToMonth(session, link, targetMonthCode, progressTracker);
        }
    }

    const attendanceData = extractAttendanceData($);
    const response = createSuccessResponse(attendanceData, session);
    progressTracker.complete(response);
}));

module.exports = router;
