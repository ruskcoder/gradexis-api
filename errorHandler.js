function sendError(res, error) {
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ success: false, message });
}

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

