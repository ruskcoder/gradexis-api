import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { authenticateUser, checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import ProgressTracker from '../utils/progressTracker.js';
import { HAC_ENDPOINTS } from '../config/constants.js';

const router = express.Router();

router.get('/teachers', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");
    
    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;

    const classesResponse = await session.get(link + HAC_ENDPOINTS.CLASSES);
    checkSessionValidity(classesResponse);

    const $ = cheerio.load(classesResponse.data);

    const teachers = [];
    $('.sg-asp-table-data-row').each(function () {
        const teacherInfo = $(this).children().eq(3).find('a');
        teachers.push({
            class: $(this).children().eq(1).text().trim(),
            teacher: teacherInfo.text().trim(),
            email: String(teacherInfo.attr('href')).replace('mailto:', '').trim()
        });
    });

    const response = createSuccessResponse({ teachers }, session);
    progressTracker.complete(response);
}));

export default router;
