const express = require('express');
const cheerio = require('cheerio');
const { asyncHandler } = require('../../errorHandler');
const { authenticateUser, checkSessionValidity } = require('../services/authentication');
const { createSuccessResponse } = require('../utils/session');
const ProgressTracker = require('../utils/progressTracker');
const { HAC_ENDPOINTS, ERROR_MESSAGES, HTTP_STATUS } = require('../config/constants');
const { APIError } = require('../middleware/errors');
const {
    extractProgressReports,
    extractReportCards,
    extractTranscriptData
} = require('../services/dataExtraction');

const router = express.Router();

router.post('/ipr', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Authenticating');
    
    const authResult = await authenticateUser(req, progressTracker);
    

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;
    progressTracker.update(50, 'Fetching progress reports');

    const progressReportUrl = link + HAC_ENDPOINTS.INTERIM_PROGRESS;
    const { data: progressReportPage } = await session.get(progressReportUrl);
    checkSessionValidity({ data: progressReportPage });

    const $ = cheerio.load(progressReportPage);
    const progressReports = await extractProgressReports(session, progressReportUrl, $);

    const response = createSuccessResponse({ progressReports }, session);
    progressTracker.complete(response);
}));

router.post('/reportCard', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Authenticating');
    
    const authResult = await authenticateUser(req, progressTracker);
    

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;

    const reportCardUrl = link + HAC_ENDPOINTS.REPORT_CARDS;
    progressTracker.update(50, 'Fetching report cards');
    const { data: reportCardPage } = await session.get(reportCardUrl);
    checkSessionValidity({ data: reportCardPage });

    const $ = cheerio.load(reportCardPage);
    const reportCards = await extractReportCards(session, reportCardUrl, $);

    const response = createSuccessResponse({ reportCards }, session);
    progressTracker.complete(response);
}));

router.post('/transcript', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Authenticating');
    
    const authResult = await authenticateUser(req, progressTracker);
    

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;
    progressTracker.update(50, 'Fetching transcript');

    const transcriptUrl = link + HAC_ENDPOINTS.TRANSCRIPT;
    const { data: transcriptPage } = await session.get(transcriptUrl);
    checkSessionValidity({ data: transcriptPage });

    const $ = cheerio.load(transcriptPage);
    const transcriptData = extractTranscriptData($);

    const response = createSuccessResponse({ transcriptData }, session);
    progressTracker.complete(response);
}));

module.exports = router;

