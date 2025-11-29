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
    if (isTestCredentials(username, password)) {
        const prodCreds = getProductionCredentials();
        username = prodCreds.username;
        password = prodCreds.password;
    }

    const loginUrl = `${link}${HAC_ENDPOINTS.LOGIN}`;
    const loginData = createLoginData(username, password);

    try {
        const { data: loginResponse } = await session.get(loginUrl);
        const $ = cheerio.load(loginResponse);
        loginData["__RequestVerificationToken"] = $("input[name='__RequestVerificationToken']").val();

        if (district) {
            const select = $('select.valid');
            let found = false;

            select.find('option').each(function () {
                const optionText = $(this).text().toLowerCase();
                if (optionText.includes(district.toLowerCase())) {
                    loginData.Database = $(this).attr('value');
                    found = true;
                    return false;
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

        if (error instanceof AuthenticationError) {
            throw error;
        }
        throw new APIError(`Login failed: ${error.message}`);
    }
}

async function authenticateWithClassLink(session, clsession, progressTracker) {
    try {
        progressTracker.update(20, 'Logging into ClassLink');

        const loginResult = await loginClassLink(session, clsession, ["hac", "homeaccess", "home access"]);

        if (loginResult && loginResult.session && loginResult.session.status === 401) {
            if (progressTracker && progressTracker.streaming) {
                progressTracker.error(401, loginResult.session.message);
                return; // Don't throw, just return
            }
            throw new AuthenticationError(loginResult.session.message);
        }
        
        const { link: hacLink, session: loggedInSession, exchangeCode } = loginResult;

        if (!hacLink || !loginResult) {

            if (progressTracker && progressTracker.streaming) {
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

        if (progressTracker && progressTracker.streaming) {
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

        if (error instanceof AuthenticationError) {
            throw error;
        }
        throw new APIError(`ClassLink authentication failed: ${error.message}`);
    }
}

async function validateSessionWithLink(session, link, progressTracker) {
    try {
        progressTracker.update(10, 'Validating existing session');

        const registration = await session.get(link + HAC_ENDPOINTS.HOME);

        if (registration.data.includes(ERROR_MESSAGES.INVALID_SESSION)) {
            return { valid: false, reason: 'expired' };
        }
        
        const splashPage = await session.get(link + HAC_ENDPOINTS.HOME);
        session.hacData = splashPage.data;
        
        return { valid: true, session };
    } catch (error) {

        return { valid: false, reason: 'error', error: error.message };
    }
}

async function authenticateUser(req, progressTracker) {
    const loginDetails = validateLoginParameters(req);
    let { loginType, link, username, password, clsession, session: existingSession, options } = loginDetails;

    let session = createSession();

    if (existingSession) {
        try {

            const cookies = typeof existingSession === 'string' ? JSON.parse(existingSession) : existingSession;
            session.defaults.jar = CookieJar.fromJSON(cookies);

            let sessionLink = link;
            if (!sessionLink) {
                const authCookie = cookies.cookies.find(cookie => cookie.key === '.AuthCookie');
                sessionLink = formatLink(authCookie?.domain);
            }

            if (sessionLink) {
                const validationResult = await validateSessionWithLink(session, sessionLink, progressTracker);
                
                if (validationResult.valid) {
                    return { session: validationResult.session, link: sessionLink, username: username || 'unknown' };
                }

                if (validationResult.reason === 'expired') {
                    if (progressTracker && progressTracker.streaming) {
                        progressTracker.update(15, 'Session expired, logging in');
                    }

                    if (loginType === 'credentials' && (!username || !password)) {
                        if (progressTracker && progressTracker.streaming) {
                            progressTracker.error(401, "Session is invalid or expired. Please provide valid credentials to re-authenticate.");
                            return;
                        }
                        throw new AuthenticationError("Session is invalid or expired. Please provide valid credentials to re-authenticate.");
                    }
                    
                    if (loginType === 'classlink' && !clsession) {
                        if (progressTracker && progressTracker.streaming) {
                            progressTracker.error(401, "Session is invalid or expired. Please provide valid ClassLink session to re-authenticate.");
                            return;
                        }
                        throw new AuthenticationError("Session is invalid or expired. Please provide valid ClassLink session to re-authenticate.");
                    }
                }
            }
        } catch (error) {

            if (error instanceof AuthenticationError) {
                throw error;
            }

        }
    }

    if (loginType === 'classlink') {
        const result = await authenticateWithClassLink(session, clsession, progressTracker);

        if (!result) {
            return;
        }
        
        return {
            session: result.session,
            link: result.link,
            username: result.username
        };
    } else {
        const district = options?.district;
        const result = await authenticateWithCredentials(session, username, password, link, district, progressTracker);

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

