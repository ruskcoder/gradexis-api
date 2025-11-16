const express = require('express');
const axios = require('axios');
const { asyncHandler } = require('../../errorHandler');
const { authenticateUser } = require('../services/authentication');
const { createSuccessResponse } = require('../utils/session');
const ProgressTracker = require('../utils/progressTracker');
const { ValidationError } = require('../middleware/errors');
const {
    fetchClassesData,
    extractClassList,
    extractTermInfo,
    extractScheduleData,
    extractAssignmentData
} = require('../services/dataExtraction');

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

module.exports = router;

