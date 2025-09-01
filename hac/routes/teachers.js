const express = require('express');
const cheerio = require('cheerio');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateUser, checkSessionValidity } = require('../services/authentication');
const { createSuccessResponse } = require('../utils/session');
const ProgressTracker = require('../utils/progressTracker');
const { HAC_ENDPOINTS } = require('../config/constants');

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

module.exports = router;
