const express = require('express');
const cheerio = require('cheerio');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateUser, checkSessionValidity } = require('../services/authentication');
const { createSuccessResponse } = require('../utils/session');
const ProgressTracker = require('../utils/progressTracker');
const { HAC_ENDPOINTS } = require('../config/constants');

const router = express.Router();

router.get('/schedule', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    
    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;

    const scheduleResponse = await session.get(link + HAC_ENDPOINTS.CLASSES);
    checkSessionValidity(scheduleResponse);

    const $ = cheerio.load(scheduleResponse.data);

    // Extract column headers
    const columns = [];
    $('.sg-asp-table-header-row').children().each(function () {
        columns.push($(this).text().trim());
    });

    // Extract schedule data
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

module.exports = router;
