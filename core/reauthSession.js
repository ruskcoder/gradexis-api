/**
 * A transparent session wrapper that re-logs-in when the portal hands back a
 * "you're logged out" page mid-request. Generalized from the old HAC-specific
 * wrapper: the platform supplies the `isSessionExpired(html)` detector and core
 * supplies the `relogin()` closure (which re-runs the right login flow), so this
 * file has zero platform knowledge.
 *
 * Implemented as a Proxy so every property/method the base session exposes
 * (defaults, cache, verification token, ad-hoc scratch props, ...) passes
 * through unchanged; only `get` is intercepted to add the retry, and
 * `baseSession` / `link` are tracked locally so relogin can swap them.
 *
 * @param {object} baseSession - a SessionWrapper from core/session.js
 * @param {string} link - the portal base URL
 * @param {object} opts
 * @param {(html:string)=>boolean} opts.isSessionExpired - detects a logged-out page
 * @param {()=>Promise<{session:object, link?:string}>} opts.relogin - fresh login
 * @returns {object} a session-like proxy
 */
function createReauthSession(baseSession, link, { isSessionExpired, relogin }) {
  const state = {
    baseSession,
    link,
    attempts: 0,
    maxAttempts: 1,
  };

  const guardedGet = async (url, config) => {
    let response = await state.baseSession.get(url, config);

    const expired = typeof isSessionExpired === 'function' && isSessionExpired(response.data);
    if (expired && relogin && state.attempts < state.maxAttempts) {
      state.attempts++;
      const fresh = await relogin();
      if (fresh?.session) state.baseSession = fresh.session;
      if (fresh?.link) state.link = fresh.link;
      response = await state.baseSession.get(url, config);
    }

    state.attempts = 0;
    return response;
  };

  const handler = {
    get(_target, prop) {
      if (prop === 'baseSession') return state.baseSession;
      if (prop === 'link') return state.link;
      if (prop === 'get') return guardedGet;
      if (prop === 'post') return (url, data, config) => state.baseSession.post(url, data, config);

      const value = state.baseSession[prop];
      return typeof value === 'function' ? value.bind(state.baseSession) : value;
    },
    set(_target, prop, value) {
      if (prop === 'baseSession') {
        state.baseSession = value;
      } else if (prop === 'link') {
        state.link = value;
      } else {
        state.baseSession[prop] = value;
      }
      return true;
    },
  };

  return new Proxy({}, handler);
}

export { createReauthSession };
