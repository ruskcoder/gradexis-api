import * as cheerio from 'cheerio';
import { createSession } from './session.js';
import { HAC_ENDPOINTS, ERROR_MESSAGES } from '../config/constants.js';
import { authenticateWithCredentials, authenticateWithClassLink } from '../services/authentication.js';

class HACSession {
  constructor(baseSession, link, loginMetadata) {
    this.baseSession = baseSession;
    this.link = link;
    this.loginMetadata = loginMetadata;
    this.reloginAttempts = 0;
    this.maxReloginAttempts = 1;
  }

  isLoginPage(responseData) {
    return responseData.includes('LogOn') || responseData.includes('__RequestVerificationToken') || responseData.includes('Welcome to');
  }

  async relogin() {
    if (this.reloginAttempts >= this.maxReloginAttempts) {
      throw new Error('Max relogin attempts exceeded');
    }

    this.reloginAttempts++;
    const { loginType, loginData } = this.loginMetadata;

    let result;
    if (loginType === 'credentials') {
      result = await authenticateWithCredentials(this.baseSession, loginData, null);
    } else if (loginType === 'classlink') {
      result = await authenticateWithClassLink(this.baseSession, loginData.clsession, null);
    } else {
      throw new Error('Invalid login type for relogin');
    }

    if (!result) {
      throw new Error('Relogin failed');
    }

    this.baseSession = result.session;
    if (result.link) {
      this.link = result.link;
    }
    this.baseSession.setLoginMetadata(loginType, loginData);
  }

  async get(url, config) {
    try {
      const response = await this.baseSession.get(url, config);

      if (this.isLoginPage(response.data)) {
        await this.relogin();
        return await this.baseSession.get(url, config);
      }

      this.reloginAttempts = 0;
      return response;
    } catch (error) {
      this.reloginAttempts = 0;
      throw error;
    }
  }

  async post(url, data, config) {
    return this.baseSession.post(url, data, config);
  }

  get defaults() {
    return this.baseSession.defaults;
  }

  get hacData() {
    return this.baseSession.hacData;
  }

  set hacData(data) {
    this.baseSession.hacData = data;
  }

  get cache() {
    return this.baseSession.cache;
  }

  setVerificationToken(token) {
    return this.baseSession.setVerificationToken(token);
  }

  getVerificationToken() {
    return this.baseSession.getVerificationToken();
  }

  setLastValidationTime(time) {
    return this.baseSession.setLastValidationTime(time);
  }

  getLastValidationTime() {
    return this.baseSession.getLastValidationTime();
  }

  isSessionFresh(minutes) {
    return this.baseSession.isSessionFresh(minutes);
  }
}

export { HACSession };
