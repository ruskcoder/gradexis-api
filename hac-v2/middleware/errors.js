import { HTTP_STATUS } from '../config/constants.js';

class APIError extends Error {
    constructor(message, status = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
        super(message);
        this.status = status;
        this.name = 'APIError';
    }
}

class AuthenticationError extends APIError {
    constructor(message) {
        super(message, HTTP_STATUS.UNAUTHORIZED);
        this.name = 'AuthenticationError';
    }
}

class ValidationError extends APIError {
    constructor(message) {
        super(message, HTTP_STATUS.BAD_REQUEST);
        this.name = 'ValidationError';
    }
}

export {
    APIError,
    AuthenticationError,
    ValidationError
};

