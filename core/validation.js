import { ValidationError } from './errors.js';

/**
 * Build the standard login-parameter validation for a platform.
 * @param {Object} config
 * @param {Object.<string, Function>} config.validators - Map of loginType -> validator(loginData).
 *   The keys define which loginTypes the platform accepts.
 * @param {Function} [config.formatLink] - Optional normalizer applied to loginData.link.
 * @returns {{ validateLoginType, validateLoginData, validateLoginParameters }}
 */
function createLoginValidation({ validators, formatLink }) {
    function validateLoginType(loginType) {
        if (!loginType || !Object.keys(validators).includes(loginType)) {
            throw new ValidationError(`loginType must be one of: ${Object.keys(validators).join(', ')}`);
        }
    }

    function validateLoginData(loginType, loginData) {
        const validator = validators[loginType];
        if (validator) {
            validator(loginData);
        }
    }

    function validateLoginParameters(req) {
        const { loginType, loginData, session, options } = req.body;

        validateLoginType(loginType);

        const preparedLoginData = { ...loginData };

        if (session) {
            return {
                loginType,
                loginData: preparedLoginData,
                session: session,
                options: options || {}
            };
        }

        if (!loginData) {
            throw new ValidationError("loginData is required");
        }

        validateLoginData(loginType, loginData);

        if (formatLink && preparedLoginData.link) {
            preparedLoginData.link = formatLink(preparedLoginData.link);
        }

        return {
            loginType,
            loginData: preparedLoginData,
            session: session,
            options: options || {}
        };
    }

    return {
        validateLoginType,
        validateLoginData,
        validateLoginParameters
    };
}

export { createLoginValidation };
