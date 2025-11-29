const express = require('express');
const cheerio = require('cheerio');
const { asyncHandler } = require('../../errorHandler');
const { authenticateUser, checkSessionValidity } = require('../services/authentication');
const { createSuccessResponse } = require('../utils/session');
const ProgressTracker = require('../utils/progressTracker');
const { HAC_ENDPOINTS, ERROR_MESSAGES, HTTP_STATUS } = require('../config/constants');
const { APIError } = require('../middleware/errors');

const router = express.Router();

router.post('/schedule', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Authenticating');
    
    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;
    progressTracker.update(50, 'Fetching schedule');

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

    const response = createSuccessResponse({ schedule }, session);
    progressTracker.complete(response);
}));

router.post('/bellSchedule', asyncHandler(async () => {
    throw new APIError(ERROR_MESSAGES.BELL_SCHEDULE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
}));

module.exports = router;

