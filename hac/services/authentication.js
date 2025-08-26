const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');
const { loginClassLink } = require('../../auth/classlink');
const { HAC_ENDPOINTS, ERROR_MESSAGES } = require('../config/constants');
const { AuthenticationError, ValidationError, APIError } = require('../middleware/errors');
const { createSession } = require('../utils/session');
const { 
    validateLoginParameters, 
    isTestCredentials, 
    getProductionCredentials, 
    createLoginData,
    formatLink
} = require('../utils/validation');

function checkSessionValidity(response) {
    if (response.data.includes(ERROR_MESSAGES.INVALID_SESSION)) {
        throw new AuthenticationError("Invalid Session");
    }
}

async function authenticateWithCredentials(session, username, password, link, district) {
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
                throw new AuthenticationError(ERROR_MESSAGES.DISTRICT_NOT_FOUND);
            }
        }

        // Submit login
        const loginResult = await session.post(loginUrl, loginData);

        if (loginResult.data.includes(ERROR_MESSAGES.INVALID_CREDENTIALS) ||
            loginResult.data.includes(ERROR_MESSAGES.INVALID_CREDENTIALS_ALT)) {
            throw new AuthenticationError(ERROR_MESSAGES.INVALID_USERNAME_PASSWORD);
        }

        session.hacData = loginResult.data;
        return { session, username };

    } catch (error) {
        if (error instanceof AuthenticationError) {
            throw error;
        }
        throw new APIError(`Login failed: ${error.message}`);
    }
}

async function authenticateWithClassLink(session, clsession, progressTracker) {
    try {
        progressTracker.update(34, 'Fetching HAC URL');

        const { link: hacLink, session: loggedInSession, exchangeCode } = await loginClassLink(session, clsession, "hac");

        if (!hacLink) {
            throw new AuthenticationError("ClassLink authentication failed");
        }

        session = loggedInSession;
        progressTracker.update(46, 'Logging into HAC');

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
        return {
            session: result.session,
            link: result.link,
            username: result.username
        };
    } else {
        const result = await authenticateWithCredentials(session, username, password, link, req.query.district);
        return {
            session: result.session,
            link,
            username: result.username
        };
    }
}

module.exports = {
    authenticateUser,
    checkSessionValidity
};
