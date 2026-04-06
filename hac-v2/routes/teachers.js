import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import { setupHACRoute } from '../utils/routeHandler.js';
import { HAC_ENDPOINTS } from '../config/constants.js';

const router = express.Router();

router.post('/teachers', asyncHandler(async (req, res) => {
    const setup = await setupHACRoute(req, res, 'Fetching teachers');
    if (!setup) return;

    const { session, link } = setup;
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

    const response = createSuccessResponse({ teachers }, session.baseSession);
    setup.progressTracker.complete(response);
}));

export default router;

