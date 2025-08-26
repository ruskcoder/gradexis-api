const { HTTP_STATUS } = require('../config/constants');

function sendError(res, error) {
    const status = error.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ success: false, message });
}

// Enhanced async handler with proper error handling
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
        if (!res.headersSent) {
            sendError(res, err);
        }
    });
};

module.exports = {
    sendError,
    asyncHandler
};
