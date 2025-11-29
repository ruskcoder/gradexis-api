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

router.get('/classes', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");

    progressTracker.update(0, 'Logging In...');
    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;

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

export default router;
