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

  // `data` may be a value or a `() => value` thunk. Portals whose request body
  // embeds session tokens (Skyward's encses/sessionid) pass a thunk so the retry
  // after a relogin rebuilds the body from the NEW session's fresh tokens instead
  // of replaying the expired ones. Plain values (HAC, cookie-auth POSTs) are used
  // as-is.
  const resolveData = (data) => (typeof data === 'function' ? data() : data);

  // Shared expiry-detect + one-shot relogin + retry, used for both GET and POST.
  // On POST the body is re-resolved after the relogin so token-bearing requests
  // are rebuilt against the refreshed session.
  const guarded = (method) => async (url, ...rest) => {
    const send = () => {
      if (method === 'post') {
        const [data, config] = rest;
        return state.baseSession.post(url, resolveData(data), config);
      }
      return state.baseSession.get(url, rest[0]);
    };

    let response = await send();
    const expired = typeof isSessionExpired === 'function' && isSessionExpired(response.data);
    if (expired && relogin && state.attempts < state.maxAttempts) {
      state.attempts++;
      const fresh = await relogin();
      if (fresh?.session) state.baseSession = fresh.session;
      if (fresh?.link) state.link = fresh.link;
      response = await send();
    }

    state.attempts = 0;
    return response;
  };

  const guardedGet = guarded('get');
  const guardedPost = guarded('post');

  const handler = {
    get(_target, prop) {
      if (prop === 'baseSession') return state.baseSession;
      if (prop === 'link') return state.link;
      if (prop === 'get') return guardedGet;
      if (prop === 'post') return guardedPost;

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
