const HTTP_STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502
};

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
    HTTP_STATUS,
    APIError,
    AuthenticationError,
    ValidationError
};
