# Platform template

Copy this folder to add a platform (`cp -r template myplatform`). A platform is
just a **registry object** — no Express, no routes. [`../core`](../core/README.md)
owns every public route, all login types (credentials + SSO), progress
streaming, the response envelope, and error handling.

`hac/` is the fully-worked reference implementation.

## The mental model

```
request ─▶ core.authenticate(req, platform)
              │   credentials ─▶ platform.credentialsAuth(...)
              │   classlink / microsoft ─▶ core SSO ─▶ tile picked by platform.ssoFilter
              ▼
         { session, link }
              │
              ▼
   platform.data[route](session, link, options, progress) ─▶ data
              │
              ▼
   core wraps → { success:true, ...data, session }   (+ SSE streaming, errors)
```

You write only the boxes that mention `platform`. Core does everything else.

## What you fill in

| File | Purpose |
|---|---|
| `index.js` | The registry object: `name`, `mount`, `ssoFilter`, `loginTypes`, `data`, … |
| `config/constants.js` | Portal endpoint paths + error-string fingerprints |
| `auth/credentials.js` | Just `credentialsAuth` (your login) + `isSessionExpired`; everything else is derived from core |
| `data/*.js` | One `(session, link, options, progress) => data` per route |
| `auth/finalizeSSO.js` | *(optional)* post-SSO-tile fixups — see `hac/auth/finalizeSSO.js` |

Link normalization (`formatLink`), the streaming-error helper (`streamOrThrow`),
and the session-validity guard (`createSessionValidator`) all come from
`core/platform.js` — set `formatLink` on the registry only if your portal needs
custom URL handling.

## Steps

1. `cp -r template myplatform`
2. In `config/constants.js`, set the portal's URLs and error strings.
3. In `auth/credentials.js`, implement the login handshake (the `TODO`s).
4. In each `data/*.js`, implement the fetch + parse (the `TODO`s). Drop any route
   your portal doesn't have — core returns a 404 for it automatically.
5. In `index.js`, set `name`, `mount`, `ssoFilter`, and `loginTypes`.
6. Register it in the top-level `index.js`:
   ```js
   import myplatform from './myplatform/index.js';
   const platforms = [hac, myplatform];
   ```

## Login types come free

`credentials` uses your `credentialsAuth`. Every SSO type — `classlink`
(clsession), `classlinkCredentials` (+ 2FA icon), and future `microsoft` — is
implemented entirely in `core/auth/`. To offer one, just add it to `loginTypes`
and make sure `ssoFilter` matches your tile on the ClassLink/SSO dashboard. No
platform code changes.

## Data function contract

```js
// (session, link, options, progressTracker) => data
async function classes(session, link, options, progressTracker) {
    const page = await session.get(link + ENDPOINTS.CLASSES);
    checkSessionValidity(page);              // throws if logged out
    progressTracker?.update?.(70, 'Parsing');
    // ...parse page.data, honor options.term...
    return { term, termList, classes };      // → { success:true, term, termList, classes, session }
}
```

- Never build the `{ success, session }` envelope — core does it.
- Never touch `req`/`res` — return a plain object, or throw an `APIError`
  (`new APIError(msg, status)`) to fail the route with that status.
- The `session` passed in auto-relogins on expiry (via `isSessionExpired`), so
  just call `session.get`/`session.post` normally.
