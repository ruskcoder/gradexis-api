import express from 'express';
import axios from 'axios';
import { asyncHandler } from '../../errorHandler.js';
import { authenticateUser } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import ProgressTracker from '../utils/progressTracker.js';
import { ValidationError } from '../middleware/errors.js';
import {
    fetchClassesData,
    extractClassList,
    extractTermInfo,
    extractScheduleData,
    extractAssignmentData
} from '../services/dataExtraction.js';

const router = express.Router();

router.post('/classes', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Logging In');
    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;
    progressTracker.update(50, 'Fetching classes');

    const { assignmentsPage, schedulePage } = await fetchClassesData(session, link, req.body?.options?.term, progressTracker);

    const courses = extractClassList(assignmentsPage);
    const { term, termList } = extractTermInfo(assignmentsPage);

    let scheduleData = extractScheduleData(schedulePage, courses);
    scheduleData = extractAssignmentData(assignmentsPage, scheduleData);

    const classes = Object.values(scheduleData);

    const response = createSuccessResponse({
        scoresIncluded: true,
        termList,
        term,
        classes
    }, session);

    progressTracker.complete(response);
}));

router.post('/single-class', asyncHandler(async (req, res) => {
    if (!req.body?.options?.class) {
        throw new ValidationError("Missing required parameters (class)");
    }

    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Authenticating');
    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;
    progressTracker.update(50, 'Fetching classes');

    const { assignmentsPage, schedulePage } = await fetchClassesData(session, link, req.body?.options?.term, progressTracker);

    const courses = extractClassList(assignmentsPage);
    const { term, termList } = extractTermInfo(assignmentsPage);

    let scheduleData = extractScheduleData(schedulePage, courses);
    scheduleData = extractAssignmentData(assignmentsPage, scheduleData);

    const classes = Object.values(scheduleData);
    const currentClass = classes.find(c => c.name === req.body.options.class);
    
    if (!currentClass) {
        throw new ValidationError("Class not found");
    }

    const response = createSuccessResponse({
        scoresIncluded: true,
        termList,
        term,
        class: currentClass
    }, session);

    progressTracker.complete(response);
}));

export default router;

