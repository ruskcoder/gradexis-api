import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import { setupHACRoute } from '../utils/routeHandler.js';
import { HAC_ENDPOINTS, ERROR_MESSAGES, HTTP_STATUS } from '../config/constants.js';
import { APIError } from '../middleware/errors.js';

const router = express.Router();

router.post('/schedule', asyncHandler(async (req, res) => {
    const setup = await setupHACRoute(req, res, 'Fetching schedule');
    if (!setup) return;

    const { session, link } = setup;
    const scheduleResponse = await session.get(link + HAC_ENDPOINTS.CLASSES);
    checkSessionValidity(scheduleResponse);

    const $ = cheerio.load(scheduleResponse.data);

    const columns = [];
    $('.sg-asp-table-header-row').children().each(function () {
        columns.push($(this).text().trim());
    });

    const schedule = [];
    $('.sg-asp-table-data-row').each(function () {
        const row = {};
        $(this).children().each(function (i) {
            row[columns[i]] = $(this).text().trim();
        });
        schedule.push(row);
    });

    const response = createSuccessResponse({ schedule }, session.baseSession);
    setup.progressTracker.complete(response);
}));

router.post('/bellSchedule', asyncHandler(async () => {
    throw new APIError(ERROR_MESSAGES.BELL_SCHEDULE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
}));

export default router;

