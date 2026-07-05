/**
 * The public face of every platform.
 *
 * There is exactly ONE route table for the whole API, declared here. Each
 * platform is a registry object exposing `data` functions; `createPlatformRoutes`
 * builds an Express router that mounts a route for every capability the platform
 * actually implements (missing ones return a standard 404). Core owns all the
 * plumbing — authentication, session reuse/relogin, SSE progress streaming, the
 * `{ success, ..., session }` envelope, and error formatting — so a platform
 * never touches `req`/`res`.
 *
 * A data function is just: `(session, link, options, progressTracker) => data`.
 */

import express from 'express';
import { asyncHandler } from '../errorHandler.js';
import ProgressTracker from './progressTracker.js';
import { createSuccessResponse } from './session.js';
import { authenticate } from './auth/index.js';
import { HTTP_STATUS, AuthenticationError } from './errors.js';

// path -> which platform.data capability serves it, plus its progress label.
const ROUTE_TABLE = [
  { path: '/info', key: 'info', stage: 'Fetching student info' },
  { path: '/classes', key: 'classes', stage: 'Fetching classes' },
  { path: '/single-class', key: 'singleClass', stage: 'Fetching class' },
  { path: '/schedule', key: 'schedule', stage: 'Fetching schedule' },
  { path: '/attendance', key: 'attendance', stage: 'Fetching attendance' },
  { path: '/teachers', key: 'teachers', stage: 'Fetching teachers' },
  { path: '/reportCard', key: 'reportCard', stage: 'Fetching report cards' },
  { path: '/ipr', key: 'ipr', stage: 'Fetching progress reports' },
  { path: '/transcript', key: 'transcript', stage: 'Fetching transcript' },
];

function isStreaming(req) {
  return req.body?.stream === true || req.body?.stream === 'true';
}

function createPlatformRoutes(platform) {
  const router = express.Router();

  // Root announce route.
  router.post('/', asyncHandler(async (req, res) => {
    res.json({ message: `${platform.name} API`, success: true });
  }));

  // /login — authenticate only, hand back the session envelope. Fetches no data,
  // but forces a validation probe (through the reauth wrapper) when possible so
  // an expired session is caught here rather than on the next data call.
  router.post('/login', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, isStreaming(req));
    try {
      const auth = await authenticate(req, platform, progressTracker);
      if (!auth) return;

      if (platform.homeEndpoint !== undefined && platform.isSessionExpired) {
        const probe = await auth.session.get(auth.link + platform.homeEndpoint);
        if (platform.isSessionExpired(probe.data)) {
          throw new AuthenticationError('Invalid session or password');
        }
      }

      const base = auth.session.baseSession || auth.session;
      progressTracker.complete(createSuccessResponse({}, base));
    } catch (error) {
      progressTracker.error(error.status || error.statusCode || 500, error.message || 'Login failed');
    }
  }));

  // Data routes — one per capability the platform implements.
  for (const { path, key, stage } of ROUTE_TABLE) {
    if (typeof platform.data?.[key] !== 'function') continue;

    router.post(path, asyncHandler(async (req, res) => {
      const progressTracker = new ProgressTracker(res, isStreaming(req));
      try {
        const auth = await authenticate(req, platform, progressTracker);
        if (!auth) return;

        progressTracker.update(50, stage);
        const data = await platform.data[key](auth.session, auth.link, req.body?.options || {}, progressTracker);

        const base = auth.session.baseSession || auth.session;
        progressTracker.complete(createSuccessResponse(data, base));
      } catch (error) {
        progressTracker.error(error.status || error.statusCode || 500, error.message || 'An error occurred');
      }
    }));
  }

  // Any canonical route the platform did NOT implement -> standard 404.
  for (const { path, key } of ROUTE_TABLE) {
    if (typeof platform.data?.[key] === 'function') continue;
    router.post(path, asyncHandler(async (req, res) => {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: `${platform.name} does not support ${key}`,
      });
    }));
  }

  return router;
}

export { createPlatformRoutes, ROUTE_TABLE };
