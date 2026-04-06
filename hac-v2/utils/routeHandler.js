import { authenticateUser } from '../services/authentication.js';
import { HACSession } from './hacSessionWrapper.js';
import { createSuccessResponse } from './session.js';
import ProgressTracker from './progressTracker.js';

/**
 * Setup helper for HAC routes - handles authentication and session initialization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} [fetchStage='Fetching data'] - Progress message for the fetch stage
 * @returns {Promise<{session, link, baseSession, progressTracker, username} | null>}
 */
export async function setupHACRoute(req, res, fetchStage = 'Fetching data') {
  const progressTracker = new ProgressTracker(res, req.body?.stream === true);
  progressTracker.update(0, 'Authenticating');

  const authResult = await authenticateUser(req, progressTracker);
  if (!authResult) {
    return null;
  }

  const { link, session: baseSession, username } = authResult;
  const session = new HACSession(baseSession, link, baseSession.getLoginMetadata());
  progressTracker.update(50, fetchStage);

  return { session, link, baseSession, progressTracker, username };
}

/**
 * Route handler wrapper for simple HAC routes
 * Handles setup, data fetching, and response creation
 * @param {Function} dataFetcher - Async function that takes (session, link, progressTracker) and returns data
 * @param {string} [fetchStage='Fetching data'] - Progress message for the fetch stage
 * @returns {Function} Express route handler
 */
export function createHACRouteHandler(dataFetcher, fetchStage = 'Fetching data') {
  return async (req, res) => {
    const setup = await setupHACRoute(req, res, fetchStage);
    if (!setup) {
      return;
    }

    const { session, progressTracker } = setup;
    
    try {
      const data = await dataFetcher(session, setup.link, progressTracker);
      const response = createSuccessResponse(data, session.baseSession);
      progressTracker.complete(response);
    } catch (error) {
      progressTracker.error(error.statusCode || 500, error.message || 'An error occurred');
    }
  };
}
