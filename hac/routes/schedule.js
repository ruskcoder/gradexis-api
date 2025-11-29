import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { authenticateUser, checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import ProgressTracker from '../utils/progressTracker.js';
import { HAC_ENDPOINTS } from '../config/constants.js';

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

export default router;
