import express from 'express';
import { asyncHandler } from '../../errorHandler.js';
import { authenticateUser, checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import ProgressTracker from '../utils/progressTracker.js';
import { HAC_ENDPOINTS } from '../config/constants.js';

const router = express.Router();

router.get('/login', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.query.stream === "true");

    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session } = authResult;

    // Verify session is valid by checking registration page
    const registration = await session.get(link + HAC_ENDPOINTS.REGISTRATION);
    checkSessionValidity(registration);

    const response = createSuccessResponse({}, session);
    progressTracker.complete(response);
}));

export default router;
