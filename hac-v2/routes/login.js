import express from 'express';
import { asyncHandler } from '../../errorHandler.js';
import { checkSessionValidity } from '../services/authentication.js';
import { setupHACRoute } from '../utils/routeHandler.js';
import { HAC_ENDPOINTS } from '../config/constants.js';

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
    const setup = await setupHACRoute(req, res, 'Verifying session');
    if (!setup) return;

    const { session, link } = setup;
    const registration = await session.get(link + HAC_ENDPOINTS.REGISTRATION);
    checkSessionValidity(registration);

    const response = {
        success: true,
        session: {
            cookies: session.baseSession.defaults.jar.toJSON(),
            cache: session.baseSession.cache || {}
        }
    };
    setup.progressTracker.complete(response);
}));

export default router;

