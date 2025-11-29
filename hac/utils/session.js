import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

function createSession() {
    const jar = new CookieJar();
    const session = wrapper(axios.create({
        withCredentials: true,
        jar,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }));
    return session;
}

function createSuccessResponse(data, session = null) {
    const response = { success: true, ...data };
    if (session) {
        response.session = session.defaults.jar.toJSON();
    }
    return response;
}

export {
    createSession,
    createSuccessResponse
};
