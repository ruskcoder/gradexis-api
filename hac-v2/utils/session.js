import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

class SessionWrapper {
  constructor(axiosInstance) {
    this.axios = axiosInstance;
    this.cache = {
      lastValidationTime: null,
      verificationToken: null
    };
    this.loginMetadata = null;
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

  setLoginMetadata(loginType, loginData) {
    this.loginMetadata = { loginType, loginData };
  }

  getLoginMetadata() {
    return this.loginMetadata;
  }

  setLastValidationTime(time) {
    this.cache.lastValidationTime = time;
  }

  getLastValidationTime() {
    return this.cache.lastValidationTime;
  }

  isSessionFresh(minutes = 5) {
    const lastValidation = this.cache.lastValidationTime;
    if (!lastValidation) return false;
    const elapsed = Date.now() - lastValidation;
    return elapsed < minutes * 60 * 1000;
  }

  setVerificationToken(token) {
    this.cache.verificationToken = token;
  }

  getVerificationToken() {
    return this.cache.verificationToken;
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
      cache: session.cache || {},
      loginMetadata: session.getLoginMetadata()
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

  if (sessionData.loginMetadata) {
    session.setLoginMetadata(sessionData.loginMetadata.loginType, sessionData.loginMetadata.loginData);
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
        session.cache = { ...session.cache, ...data.cache };
      }
      if (data.loginMetadata) {
        session.setLoginMetadata(data.loginMetadata.loginType, data.loginMetadata.loginData);
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