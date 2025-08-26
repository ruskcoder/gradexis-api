const express = require('express');
const axios = require('axios');
const { asyncHandler } = require('../middleware/errorHandler');
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

router.get('/classes', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");

    progressTracker.update(0, 'Logging In...');
    const { link, session } = await authenticateUser(req, progressTracker);

    const { assignmentsPage, schedulePage } = await fetchClassesData(session, link, req.query.term, progressTracker);

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

router.get('/grades', asyncHandler(async (req, res) => {
    if (!req.query.class) {
        throw new ValidationError("Missing required parameters (class)");
    }

    // Get classes data and find the specific class
    const { data: classesData } = await axios.get(`${req.protocol}://${req.get('host')}/hac/classes`, {
        params: req.query
    });

    const currentClass = classesData.classes.find(c => c.name === req.query.class);
    if (!currentClass) {
        throw new ValidationError("Class not found");
    }

    const response = createSuccessResponse({
        term: classesData.term,
        ...currentClass
    });

    // Preserve session from classes endpoint
    response.session = classesData.session;
    res.json(response);
}));

module.exports = router;
