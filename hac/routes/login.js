const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateUser, checkSessionValidity } = require('../services/authentication');
const { createSuccessResponse } = require('../utils/session');
const ProgressTracker = require('../utils/progressTracker');
const { HAC_ENDPOINTS } = require('../config/constants');

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

module.exports = router;
