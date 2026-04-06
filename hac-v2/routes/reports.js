import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import { setupHACRoute } from '../utils/routeHandler.js';
import { HAC_ENDPOINTS, ERROR_MESSAGES, HTTP_STATUS } from '../config/constants.js';
import { APIError } from '../middleware/errors.js';
import {
    extractProgressReports,
    extractReportCards,
    extractTranscriptData
} from '../services/dataExtraction.js';

const router = express.Router();

router.post('/ipr', asyncHandler(async (req, res) => {
    const setup = await setupHACRoute(req, res, 'Fetching progress reports');
    if (!setup) return;

    const { session, link } = setup;
    const progressReportUrl = link + HAC_ENDPOINTS.INTERIM_PROGRESS;
    const { data: progressReportPage } = await session.get(progressReportUrl);
    checkSessionValidity({ data: progressReportPage });

    const $ = cheerio.load(progressReportPage);
    const progressReports = await extractProgressReports(session, progressReportUrl, $);

    const response = createSuccessResponse({ progressReports }, session.baseSession);
    setup.progressTracker.complete(response);
}));

router.post('/reportCard', asyncHandler(async (req, res) => {
    const setup = await setupHACRoute(req, res, 'Fetching report cards');
    if (!setup) return;

    const { session, link } = setup;
    const reportCardUrl = link + HAC_ENDPOINTS.REPORT_CARDS;
    const { data: reportCardPage } = await session.get(reportCardUrl);
    checkSessionValidity({ data: reportCardPage });

    const $ = cheerio.load(reportCardPage);
    const reportCards = await extractReportCards(session, reportCardUrl, $);

    const response = createSuccessResponse({ reportCards }, session.baseSession);
    setup.progressTracker.complete(response);
}));

router.post('/transcript', asyncHandler(async (req, res) => {
    const setup = await setupHACRoute(req, res, 'Fetching transcript');
    if (!setup) return;

    const { session, link } = setup;
    const transcriptUrl = link + HAC_ENDPOINTS.TRANSCRIPT;
    const { data: transcriptPage } = await session.get(transcriptUrl);
    checkSessionValidity({ data: transcriptPage });

    const $ = cheerio.load(transcriptPage);
    const transcriptData = extractTranscriptData($);

    const response = createSuccessResponse({ transcriptData }, session.baseSession);
    setup.progressTracker.complete(response);
}));

export default router;

