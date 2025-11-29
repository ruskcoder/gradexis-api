import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { authenticateUser, checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import ProgressTracker from '../utils/progressTracker.js';
import { HAC_ENDPOINTS, MONTH_NAMES } from '../config/constants.js';
import {
    processAttendanceDate,
    calculateMonthCode,
    navigateToMonth,
    extractAttendanceData
} from '../services/dataExtraction.js';

const router = express.Router();

router.post('/attendance', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Authenticating');
    
    const authResult = await authenticateUser(req, progressTracker);
    

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;
    progressTracker.update(50, 'Fetching attendance');

    let dateInfo = null;
    if (req.body?.options?.date) {
        dateInfo = processAttendanceDate(req.body.options.date);
    }

    const attendanceResponse = await session.get(link + HAC_ENDPOINTS.ATTENDANCE);
    checkSessionValidity(attendanceResponse);

    let $ = cheerio.load(attendanceResponse.data);

    if (dateInfo) {
        const targetMonthCode = calculateMonthCode(dateInfo.reqYear, dateInfo.monthIndex);

        if (!attendanceResponse.data.includes(MONTH_NAMES[dateInfo.monthIndex])) {
            $ = await navigateToMonth(session, link, targetMonthCode, progressTracker);
        }
    }

    const attendanceData = extractAttendanceData($);
    const response = createSuccessResponse(attendanceData, session);
    progressTracker.complete(response);
}));

export default router;

