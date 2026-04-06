import express from 'express';
import { asyncHandler } from '../../errorHandler.js';
import { createSuccessResponse } from '../utils/session.js';
import { setupHACRoute } from '../utils/routeHandler.js';
import { ValidationError } from '../middleware/errors.js';
import {
    fetchClassesData,
    extractClassList,
    extractTermInfo,
    extractScheduleData,
    extractAssignmentData
} from '../services/dataExtraction.js';

const router = express.Router();

async function processClassesData(session, link, term, progressTracker) {
    const { assignmentsPage, schedulePage, session: updatedSession } = await fetchClassesData(session, link, term, progressTracker);
    const courses = extractClassList(assignmentsPage);
    const { term: termData, termList } = extractTermInfo(assignmentsPage);

    let scheduleData = extractScheduleData(schedulePage, courses);
    scheduleData = extractAssignmentData(assignmentsPage, scheduleData);

    const classes = Object.values(scheduleData);

    return { classes, termList, term: termData, updatedSession };
}

router.post('/classes', asyncHandler(async (req, res) => {
    const setup = await setupHACRoute(req, res, 'Fetching classes');
    if (!setup) return;

    const { classes, termList, term, updatedSession } = await processClassesData(
        setup.session,
        setup.link,
        req.body?.options?.term,
        setup.progressTracker
    );

    const response = createSuccessResponse({
        scoresIncluded: true,
        termList,
        term,
        classes
    }, updatedSession.baseSession);

    setup.progressTracker.complete(response);
}));

router.post('/single-class', asyncHandler(async (req, res) => {
    if (!req.body?.options?.class) {
        throw new ValidationError("Missing required parameters (class)");
    }

    const setup = await setupHACRoute(req, res, 'Fetching classes');
    if (!setup) return;

    const { classes, termList, term, updatedSession } = await processClassesData(
        setup.session,
        setup.link,
        req.body?.options?.term,
        setup.progressTracker
    );

    const currentClass = classes.find(c => c.name === req.body.options.class);

    if (!currentClass) {
        throw new ValidationError("Class not found");
    }

    const response = createSuccessResponse({
        scoresIncluded: true,
        termList,
        term,
        class: currentClass
    }, updatedSession.baseSession);

    setup.progressTracker.complete(response);
}));

export default router;

