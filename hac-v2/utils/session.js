import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

class SessionWrapper {
  constructor(axiosInstance) {
    this.axios = axiosInstance;
    this.cache = {};
  }

  async get(url, config) {
    return this.axios.get(url, config);
  }

  async post(url, data, config) {
    return this.axios.post(url, data, config);
  }

  get defaults() {
    return this.axios.defaults;
  }

  get hacData() {
    return this._hacData;
  }

  set hacData(data) {
    this._hacData = data;
  }
}

function createSession() {
  const jar = new CookieJar();
  const axiosInstance = wrapper(axios.create({
    withCredentials: true,
    jar,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }));

  return new SessionWrapper(axiosInstance);
}

function createSuccessResponse(data, session = null) {
  const response = { success: true, ...data };
  if (session) {
    response.session = {
      cookies: session.defaults.jar.toJSON(),
      cache: session.cache || {}
    };
  }
  return response;
}

function restoreSession(sessionData) {
  const jar = new CookieJar();

  if (sessionData.cookies) {
    jar.fromJSON(sessionData.cookies);
  }

  const axiosInstance = wrapper(axios.create({
    withCredentials: true,
    jar,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }));

  const session = new SessionWrapper(axiosInstance);

  if (sessionData.cache) {
    session.cache = sessionData.cache;
  }

  return session;
}

function restoreCookiesIntoSession(session, sessionData) {
  if (!sessionData) {
    return session;
  }

  try {
    const data = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;

    if (data.cookies) {
      session.defaults.jar = CookieJar.fromJSON(data.cookies);
      if (data.cache) {
        session.cache = data.cache;
      }
    } else {
      session.defaults.jar = CookieJar.fromJSON(data);
    }
  } catch (error) {
    console.error('Failed to restore session data:', error);
  }

  return session;
}

export {
  createSession,
  createSuccessResponse,
  restoreSession,
  restoreCookiesIntoSession
};