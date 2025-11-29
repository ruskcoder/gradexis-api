import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { loginClassLink } from '../../auth/classlink.js';
import { HAC_ENDPOINTS, ERROR_MESSAGES } from '../config/constants.js';
import { AuthenticationError, ValidationError, APIError } from '../middleware/errors.js';
import { createSession } from '../utils/session.js';
import { 
    validateLoginParameters, 
    isTestCredentials, 
    getProductionCredentials, 
    createLoginData,
    formatLink
} from '../utils/validation.js';

function checkSessionValidity(response) {
    if (response.data.includes(ERROR_MESSAGES.INVALID_SESSION)) {
        throw new AuthenticationError("Invalid Session");
    }
}

async function authenticateWithCredentials(session, username, password, link, district, progressTracker) {
    // Handle test credentials
    if (isTestCredentials(username, password)) {
        const prodCreds = getProductionCredentials();
        username = prodCreds.username;
        password = prodCreds.password;
    }

    const loginUrl = `${link}${HAC_ENDPOINTS.LOGIN}`;
    const loginData = createLoginData(username, password);

    try {
        // Get login page and extract token
        const { data: loginResponse } = await session.get(loginUrl);
        const $ = cheerio.load(loginResponse);
        loginData["__RequestVerificationToken"] = $("input[name='__RequestVerificationToken']").val();

        // Handle district selection if provided
        if (district) {
            const select = $('select.valid');
            let found = false;

            select.find('option').each(function () {
                const optionText = $(this).text().toLowerCase();
                if (optionText.includes(district.toLowerCase())) {
                    loginData.Database = $(this).attr('value');
                    found = true;
                    return false; // break loop
                }
            });

            if (!found) {
                if (progressTracker && progressTracker.streaming) {
                    progressTracker.error(401, ERROR_MESSAGES.DISTRICT_NOT_FOUND);
                    return; // Don't throw, just return
                }
                throw new AuthenticationError(ERROR_MESSAGES.DISTRICT_NOT_FOUND);
            }
        }

        // Submit login
        const loginResult = await session.post(loginUrl, loginData);

        if (loginResult.data.includes(ERROR_MESSAGES.INVALID_CREDENTIALS) ||
            loginResult.data.includes(ERROR_MESSAGES.INVALID_CREDENTIALS_ALT)) {
            if (progressTracker && progressTracker.streaming) {
                progressTracker.error(401, ERROR_MESSAGES.INVALID_USERNAME_PASSWORD);
                return; // Don't throw, just return
            }
            throw new AuthenticationError(ERROR_MESSAGES.INVALID_USERNAME_PASSWORD);
        }

        session.hacData = loginResult.data;
        return { session, username };

    } catch (error) {
        // Handle streaming errors
        if (progressTracker && progressTracker.streaming) {
            let errorMessage = "Login failed";
            let statusCode = 401;
            
            if (error instanceof AuthenticationError) {
                errorMessage = error.message;
                statusCode = error.status || 401;
            } else {
                errorMessage = `Login failed: ${error.message}`;
                statusCode = 500;
            }
            
            progressTracker.error(statusCode, errorMessage);
            return; // Don't throw, just return
        }
        
        // Non-streaming error handling
        if (error instanceof AuthenticationError) {
            throw error;
        }
        throw new APIError(`Login failed: ${error.message}`);
    }
}

async function authenticateWithClassLink(session, clsession, progressTracker) {
    try {
        progressTracker.update(25, 'Fetching HAC URL');

        const loginResult = await loginClassLink(session, clsession, ["hac", "homeaccess", "home access"]);
        
        // Check if loginClassLink returned an error response
        if (loginResult && loginResult.session && loginResult.session.status === 401) {
            if (progressTracker.streaming) {
                progressTracker.error(401, loginResult.session.message);
                return; // Don't throw, just return
            }
            throw new AuthenticationError(loginResult.session.message);
        }
        
        const { link: hacLink, session: loggedInSession, exchangeCode } = loginResult;

        if (!hacLink || !loginResult) {
            // If streaming, send error response immediately
            if (progressTracker.streaming) {
                progressTracker.error(401, "ClassLink authentication failed");
                return; // Don't throw, just return
            }
            throw new AuthenticationError("ClassLink authentication failed");
        }

        session = loggedInSession;
        progressTracker.update(30, 'Logging into HAC');

        const hacResponse = await session.get(hacLink);
        const urlObj = new URL(hacLink);
        let link = urlObj.origin + '/';
        const username = exchangeCode.data.user.loginId;
        let hacSplash = hacResponse.data;

        // Special handling for Conroe ISD
        if (exchangeCode.data.user.tenantName.includes("Conroe ISD")) {
            const gwsToken = hacLink.split("GWSToken=")[1];
            await session.get(hacLink);
            await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=isapps.conroeisd.net&p=443&s=513&l=802&gwsToken=${gwsToken}`);
            await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=paclite.conroeisd.net&p=443&s=514&l=803&gwsToken=${gwsToken}`);
            await session.get(`https://cl-revp-25.conroeisd.net/authenticate?v=cisdnet.conroeisd.net&p=443&s=517&l=806&gwsToken=${gwsToken}`);

            const conroeResponse = await session.get('https://hac.conroeisd.net/HomeAccess/District/Student/ConroeISD');
            hacSplash = conroeResponse.data;
            link = 'https://hac.conroeisd.net/';
        }

        session.hacData = hacSplash;
        return { session, username, link };

    } catch (error) {
        // Handle streaming errors
        if (progressTracker.streaming) {
            let errorMessage = "ClassLink authentication failed";
            let statusCode = 401;
            
            if (error instanceof AuthenticationError) {
                errorMessage = error.message;
                statusCode = error.status || 401;
            } else {
                errorMessage = `ClassLink authentication failed: ${error.message}`;
                statusCode = 500;
            }
            
            progressTracker.error(statusCode, errorMessage);
            return; // Don't throw, just return
        }
        
        // Non-streaming error handling
        if (error instanceof AuthenticationError) {
            throw error;
        }
        throw new APIError(`ClassLink authentication failed: ${error.message}`);
    }
}

async function authenticateUser(req, progressTracker) {
    const loginDetails = validateLoginParameters(req);
    let { link, username, password } = loginDetails;

    let session = createSession();

    // Handle existing session
    if (req.query.session) {
        try {
            const cookies = JSON.parse(req.query.session);
            session.defaults.jar = CookieJar.fromJSON(cookies);

            if (!link) {
                const authCookie = cookies.cookies.find(cookie => cookie.key === '.AuthCookie');
                link = formatLink(authCookie?.domain);
            }

            return { session, link, username };
        } catch (error) {
            throw new ValidationError("Invalid session data");
        }
    }

    // Authenticate based on method
    if (req.query.clsession) {
        const result = await authenticateWithClassLink(session, req.query.clsession, progressTracker);
        
        // If result is undefined, it means an error was handled in streaming mode
        if (!result) {
            return;
        }
        
        return {
            session: result.session,
            link: result.link,
            username: result.username
        };
    } else {
        const result = await authenticateWithCredentials(session, username, password, link, req.query.district, progressTracker);
        
        // If result is undefined, it means an error was handled in streaming mode
        if (!result) {
            return;
        }
        
        return {
            session: result.session,
            link,
            username: result.username
        };
    }
}

export {
    authenticateUser,
    checkSessionValidity
};
