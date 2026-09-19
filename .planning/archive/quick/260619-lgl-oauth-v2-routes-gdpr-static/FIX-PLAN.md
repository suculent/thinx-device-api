# OAuth-completion fix plan

Evidence base: `~/tmp/rtm.thinx.cloud-2.har` (preserve-log capture of a full
Google login on the legacy console) + `console.thinx.cloud.har` (Vue flow lands
on rtm). Three distinct problems, three independent fixes.

---

## Fix A — Legacy (rtm) OAuth bounce: session cookie never set  ⭐ root-caused, high-confidence

**Symptom:** Google/GitHub login on `rtm.thinx.cloud` flashes the dashboard then
returns to login.

**Evidence (HAR):** `POST /api/login` → 200 with **no `Set-Cookie`**; then every
`/api/user/*` → 401 with no cookie → `thinx-api.js:175` redirects to `/`.

**Root cause:** `lib/router.auth.js:105` (`performTokenLogin`) forces
`req.session.cookie.secure = true` in prod. TLS is terminated at Traefik (app sees
HTTP); `trust proxy` (`thinx-core.js:435`) is `['loopback','127.0.0.1']`, which
does not include Traefik's overlay IP, so `req.secure === false`. express-session
will not emit a `Secure` cookie over a connection it sees as insecure → no cookie
→ unauthenticated dashboard. The global `sessionConfig` intentionally uses
`secure: false` (`thinx-core.js:329`); the per-request override fights it. The
password path doesn't override it, which is why password login works.

**Fix (minimal, matches the working password path):** in `performTokenLogin`,
drop the per-request cookie overrides that conflict with `sessionConfig`:
```js
// remove (lines ~104-107):
req.session.cookie.name   = "x-thx-core";                       // no-op (name is middleware-level)
req.session.cookie.secure = process.env.NODE_ENV !== 'development'; // THE BUG
req.session.cookie.httpOnly = true;                              // already in sessionConfig
req.session.cookie.sameSite = 'strict';                          // see note
```
Let the cookie inherit `sessionConfig` (`secure:false, httpOnly:true,
domain:.thinx.cloud`). Keep the `maxAge` logic already set above. Drop
`sameSite:'strict'` too — the global default is friendlier to the cross-site
OAuth return and the legacy `/app` calls are same-site anyway.

**Alternative (not chosen):** set `trust proxy` to the Traefik network (or `true`)
so `req.secure` is honored and real `Secure` cookies work. More correct long-term
but higher blast radius (affects rate-limiter client IP and every cookie) — do
separately, not as the incident fix.

**Test:** extend `ZZ-RouterOAuthSpec` (or a new auth spec) — `POST /api/login`
with a redis-seeded OAuth token must return a `Set-Cookie: x-thx-core=...` header.

**Risk:** very low. Reverts OAuth cookie behavior to the same config the password
flow already uses in prod.

---

## Fix B — Vue (console.thinx.cloud) OAuth never returns to console  ⭐ root-caused, larger

**Symptom:** Google/GitHub on `console.thinx.cloud` ends on `rtm.thinx.cloud`
login. HAR: the console flow's final document is `rtm.thinx.cloud/`.

**Root cause:** the callback always redirects to a single
`app_config.public_url` (rtm) + legacy `auth.html` (`router.google.js:229`,
`createUserWithGoogle`, and the GitHub equivalent). It has no notion of which
console started the flow, and the Vue SPA authenticates via JWT (no `auth.html`,
no session-cookie use).

**Fix (two parts):**
1. **Origin-aware callback.** Capture the initiating origin at
   `GET /api/(v2/)oauth/{google,github}` — bind it to the existing one-shot
   `state`/redis marker (don't trust an open redirect param) against an allowlist
   (`rtm.thinx.cloud`, `console.thinx.cloud`). On callback, redirect back to that
   origin instead of hardcoded `public_url`.
2. **JWT for the SPA.** Issue `access_token`/`refresh_token` (reuse
   `app.login.sign_with_refresh`, as the password path does) and hand them to the
   Vue return handler. Add a small Vue route (e.g. `/oauth-return`) that reads the
   tokens, stores them like `Login.vue` does, and routes to the dashboard.

**Console change required** (services/console submodule): the Vue return handler.
So Fix B spans api + console and needs a console pin bump to deploy. Fix A is
api-only.

**Risk:** medium — touches the OAuth redirect + token issuance and adds a Vue
route. Allowlist the origin strictly (no open redirect).

---

## Open — `/static/gdpr.html` 404 (not yet root-caused)

`thinx-core.js:433` mounts `/static`; `static/gdpr.html` exists; Dockerfile ships
it (`COPY . .`); Traefik routes all of rtm to the API. Still 404 on fresh code.
Deploy-lag theory was falsified. Needs its own evidence pass (confirm the mount is
reached at runtime / `__dirname` / route order). Lower priority than A and B.

---

## Sequencing

1. **Fix A first** — smallest, root-caused, api-only, restores legacy OAuth fully.
   Ship via `thinx-staging` (same path as the routing fix). Verify with a
   preserve-log login on rtm: `POST /api/login` returns `Set-Cookie` and
   `/api/user/profile` → 200.
2. **Fix B next** — api + Vue console, behind a brief review of the origin
   allowlist + JWT return handler. Bump console pin to deploy.
3. **gdpr 404** — separate quick task once A/B land.
