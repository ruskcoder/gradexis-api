import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import { setupHACRoute } from '../utils/routeHandler.js';
import { HAC_ENDPOINTS } from '../config/constants.js';
import {
    processAttendanceDate,
    calculateMonthCode,
    extractCurrentMonthInfo,
    navigateToMonth,
    extractAttendanceData
} from '../services/dataExtraction.js';

const router = express.Router();

router.post('/attendance', asyncHandler(async (req, res) => {
    const cachedAttendance = req.body?.session?.cache?.attendanceState;
    const setup = await setupHACRoute(req, res, 'Fetching attendance');
    if (!setup) return;

    const { session, link, progressTracker } = setup;
    const requestedDate = req.body?.options?.date ? processAttendanceDate(req.body.options.date) : null;
    const targetMonthCode = requestedDate ? calculateMonthCode(requestedDate.reqYear, requestedDate.monthIndex) : null;

    const cachedState = session.baseSession.cache.attendanceState;
    let $;
    let currentMonthInfo;

    if (cachedState?.$ ) {
        $ = cachedState.$;
        currentMonthInfo = cachedState.monthInfo;
    } else {

        const attendanceResponse = await session.get(link + HAC_ENDPOINTS.ATTENDANCE);
        checkSessionValidity(attendanceResponse);

        $ = cheerio.load(attendanceResponse.data);
        currentMonthInfo = extractCurrentMonthInfo($);

        session.baseSession.cache.attendanceState = { $, monthInfo: currentMonthInfo };
    }

    if (targetMonthCode && targetMonthCode !== currentMonthInfo.monthCode) {
        $ = await navigateToMonth(session, link, targetMonthCode, progressTracker, $);
        const newMonthInfo = extractCurrentMonthInfo($);
        session.baseSession.cache.attendanceState = { $, monthInfo: newMonthInfo };
    }

    const attendanceData = extractAttendanceData($);
    const response = createSuccessResponse(attendanceData, session.baseSession);
    progressTracker.complete(response);
}));

export default router;

