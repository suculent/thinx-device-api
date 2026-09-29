---
phase: 24-secrets-sweep
reviewed: 2026-09-29T12:07:43Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - docker-swarm.yml
  - lib/router.github.js
  - lib/router.google.js
  - lib/router.slack.js
  - lib/thinx/builder.js
  - lib/thinx/globals.js
  - lib/thinx/messenger.js
  - lib/thinx/notifier.js
  - lib/thinx/owner.js
  - lib/thinx/queue.js
  - lib/thinx/redis-health.js
  - lib/thinx/rsakey.js
  - lib/thinx/transfer.js
  - services/transformer/app.js
  - services/transformer/secrets.js
  - services/transformer/secrets.test.js
  - services/transformer/trans.js
  - services/transformer/transformer.js
  - services/worker/CLAUDE.md
  - services/worker/class.js
  - services/worker/secrets.js
  - services/worker/test.js
  - services/worker/worker.js
  - spec/jasmine/03-RsakeySpec.js
  - spec/jasmine/BuilderPathSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/SecretsSweepSpec.js
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-09-29T12:07:43Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

I reviewed the phase-24 diffs: parent `2cfce1a9^..HEAD`, worker `d6ca153..b8c03b6` and transformer
`d4f5985..a75c490`. I also read the surrounding code in each touched function and followed the
calls into `oauth-github.js`, `builder.releaseWorker`, the `queue.js` socket.io server and
the worker's socket client.

The readSecret migration itself is sound:
- Every swept credential goes through `readSecret`, and the file wins over env.
- The truthiness guards cover both `null` and `""`.
- No integration builds a client from a missing value. Mailgun, Rollbar, the GitHub and Google
  OAuth clients, the Slack token exchange and the WORKER_SECRET job dispatch are all guarded.
- No secret value reaches a log line.
- The globals.js Rollbar change also fixes an older bug: `load()` used to build a new Rollbar
  client, with new uncaught-exception handlers, on every call.
- The worker's own suite passes (60/60, run locally).

The findings below are mostly pre-existing defects inside functions this phase rewrote, or
operational gaps that weaken what the phase claims (the WORKER_SECRET rotation and
docker-swarm.yml "mirroring live"). CR-01 is pre-existing, but it is a real cross-account
login defect in `secureGithubCallbacks`, which this phase edited, so it is classified as a
BLOCKER.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: GitHub OAuth `token` listeners pile up on a shared emitter, so one user's token can be delivered on another user's response (pre-existing, in a function this phase rewrote)

**File:** `lib/router.github.js:176-233` (with `lib/thinx/oauth-github.js:105,160`)
**Issue:** `githubOAuth` is one process-wide `EventEmitter` built once at mount time (line 62). Every
request to `/api/oauth/github/callback` runs `secureGithubCallbacks`, and that call adds another
`githubOAuth.on('token', …)` and `on('error', …)` listener. Each listener closes over that request's
`original_response`. Listeners are never removed. When any user's token exchange succeeds,
`oauth-github.js:160` calls `emitter.emit('token', data)`, and **every** listener ever registered
runs with that token:
- Concurrent logins: user B's listener gets user A's token. It calls `api.github.com/user` with
  it, writes `ghat:<A's token>` to Redis and redirects **B's** browser with A's session token, so
  B is logged in as A. The reverse can happen too.
- Sequential logins: each earlier listener calls `res.redirect` on a response that has already
  ended. That throws `ERR_HTTP_HEADERS_SENT` inside the `userlib.get` callback, which is an
  uncaught exception. Every stale listener also makes a GitHub `/user` call and a Redis write
  with the new user's token. The cost grows with every login since process start, and Node
  will print MaxListenersExceededWarning.

This phase rewrote this function (`buildGithubOAuth`, the 400 guard) but kept the listener
registration.
**Fix:** Drop the per-request emitter listeners and handle the token in the per-request callback
that `oauth-github.js` already calls (`cb(null, data)` at line 161):
```js
app.get(['/api/oauth/github/callback', '/api/v2/oauth/github/callback'], function (req, res) {
    res.thx_return_origin = oauthReturn.takeReturnOrigin(req, res);
    if (typeof (githubOAuth) === "undefined") githubOAuth = buildGithubOAuth();
    if (typeof (githubOAuth) === "undefined") return res.status(400).end();
    githubOAuth.callback(req, res, (err, access_token) => {
        if (err || !access_token) {
            if (!res.writableEnded) res.status(401).end();
            return;
        }
        handleGithubToken(access_token, res); // the body of the old 'token' listener
    });
});
```
Register a single, response-independent `'error'` logger once, right after `buildGithubOAuth()`.
Also make `oauth-github.js` end the response itself on the "Invalid GitHub Response" branch
(line 163), which currently neither emits nor calls `cb` and leaves the request hanging.

## Warnings

### WR-01: The rotated WORKER_SECRET still falls back to the old, leaked value in the env of both services

**File:** `docker-swarm.yml:287` (api), `docker-swarm.yml:478` (worker); read sites `lib/thinx/builder.js:304`, `services/worker/class.js:120`
**Issue:** D-07 rotated WORKER_SECRET because logs from before 23-02 contain the old value.
Under D-06, the env var on both `thinx_api` and `thinx_worker` still holds that old value
(the yml comment at lines 36-37 says so). `readSecret` falls back to env whenever
`/run/secrets/WORKER_SECRET` is missing. That happens after the D-12 `--secret-rm` rollback, if a
service update drops the mount, or in any non-swarm `docker compose` run from the same `.env`.
In each case both sides silently agree on the leaked value again, with no signal that the
rotation was undone. The old value also stays readable by anyone with
`docker service inspect` access. For the other credentials the env fallback is harmless,
because file and env hold the same value. For the one rotated credential it defeats the
rotation.
**Fix:** Bring this single item forward from SEC-CFG-03: remove `WORKER_SECRET` from the
`environment:` of both `thinx_api` and `thinx_worker` (`docker service update --env-rm
WORKER_SECRET`, on both services in the same window), and drop the two env lines from
docker-swarm.yml. Also update the rotated value in the deployment `.env`. Without a secret file
the fail-closed paths (builder.js:305 and class.js:121) then refuse, instead of reverting to the
leaked value.

### WR-02: docker-swarm.yml mounts COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD on api, which the live service does not, so any stack deploy switches DB and Redis credentials

**File:** `docker-swarm.yml:259-272`
**Issue:** D-10 says the file mirrors the live stack, and the 24-06 parity check notes that these
three entries exist only in the yml. They are still active list entries under `secrets:`.
Any `docker stack deploy` using this file mounts them, and the operational `restart.sh` path
uses stack deploy. Because `readSecret` prefers the file over env
(`globals.js:98`, `database.js:16`), the API would then take its CouchDB and Redis
credentials from secret values created on 2026-09-18 from `.env`, not from the env it runs
with today. If those differ at all, including by trailing whitespace (the file value is
trimmed, env is not), the API loses its DB and Redis connections: a deploy-time outage caused by a
file that claims to mirror production. Also, the comment "Declared here but NOT mounted on the
live thinx_api yet" at line 259 sits above all twelve entries, so a reader cannot tell it
applies only to the first three.
**Fix:** Comment the three entries out until SEC-CFG-04 mounts them, and separate them clearly:
```yaml
    secrets:
      # SEC-CFG-04: exist in the swarm, NOT mounted on live thinx_api yet.
      # - COUCHDB_USER
      # - COUCHDB_PASS
      # - REDIS_PASSWORD
      # Live mounts (phase 24):
      - SLACK_BOT_TOKEN
      ...
```

### WR-03: The worker socket server does not authenticate workers, so any peer on the overlay can register and receive WORKER_SECRET. The `queue.js` handler this phase edited is dead code, and its spec tests a path that cannot run.

**File:** `lib/thinx/queue.js:95-100, 451-459, 505-508`; `spec/jasmine/SecretsSweepSpec.js:484-525`; `services/worker/class.js:40`
**Issue:**
- The socket.io server on port 4000 accepts any connection and any `register` event, with no
  `io.use` middleware and no check of `handshake.auth`. `runRemoteShell` then sends that socket
  a job carrying `secret: worker_secret` and the owner's decrypted `--env` payload.
- The api service sits on the `internal` and `traefik-public` overlays. Any container there
  that can reach `api:4000` can register as a worker and harvest the freshly rotated
  WORKER_SECRET along with build secrets. That includes the transformer, which runs
  user-supplied JavaScript.
- The worker never sends a token either: `io(build_server)` passes no `auth` option.
- The `connect_error` handler that phase 24 rewrote in `queue.js` (451-459) is a client-side
  socket.io event. It never fires on a server-side `Socket`, which also has no `.auth`
  (`handshake.auth` is the server-side field) and no `.connect()`. If it could fire,
  `socket.auth.token = …` would throw a TypeError.
- SecretsSweepSpec covers that handler with a fake socket that has `auth: {}` and `connect()`.
  The test gives coverage for a code path production cannot reach, while the actual
  authentication gap has none.

This is pre-existing, but it limits what the D-07 rotation achieves.
**Fix:**
- Authenticate at the handshake:
```js
this.io.use((socket, next) => {
    const expected = readSecret("WORKER_SECRET");
    const got = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
    if (!expected || typeof got !== "string" || got.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
        return next(new Error("unauthorized"));
    }
    next();
});
```
- In the worker, connect with `io(build_server, { auth: { token: readSecret("WORKER_SECRET") } })`.
- Delete the dead server-side `connect_error` handler and its two specs.
- Roll out worker-first: the new worker must send the token before the API starts requiring it.

### WR-04: Slack bot-token precedence is inverted between `getBotToken()` and `initSlack()`

**File:** `lib/thinx/messenger.js:124-146, 300-302`
**Issue:** Both functions were rewritten in this phase, but they resolve the token in opposite
orders:
- `initSlack` prefers the configured token (secret file or env) over the Redis-saved
  `__SLACK_BOT_TOKEN__` (lines 145-146).
- `getBotToken()` prefers the Redis-saved token over the configured one (lines 129-135).

`getBotToken()` is also what the RTM `ready` handler uses for `fetchAndUpdateChannel` (line 300).
So when a Redis token exists, RTM connects as the configured bot, but the channel lookup and
update run with a different token. That token may belong to a different workspace, since
`/api/slack/redirect` is unauthenticated and writes whatever bot token Slack returns for the
supplied `code` whenever `SLACK_CLIENT_SECRET` is set. The comment at line 126 ("Default
built-in startup token") suggests the configured token is meant to win.
**Fix:** Resolve precedence in one place and use it everywhere:
```js
async getBotToken() {
    const configured = readSecret("SLACK_BOT_TOKEN");
    if (configured) return configured;
    const saved = await this.redis.get("__SLACK_BOT_TOKEN__");
    return saved || null;
}
```
Then drop the second override in `initSlack` (lines 144-146).

## Info

### IN-01: The disabled GitHub OAuth path logs "[critical]" on every callback, and the login route destroys the session before answering 400

**File:** `lib/router.github.js:178-181, 239-251`
**Issue:**
- D-02 asks for one info line per disabled integration. With GitHub OAuth off, every hit on
  `/api/oauth/github/callback` also logs `[critical] [githubOAuth] undefined on secure!
  attempting to fix...`.
- The "fix" can never succeed, because `readSecret` has cached the missing value for the life
  of the process.
- On `/api/oauth/github`, `req.session.destroy()` and the return-origin cookie run before the
  disabled check. A cross-site GET therefore still logs the user out even though the route
  answers 400. `router.google.js:183` places its guard before the session destroy.

**Fix:** In `secureGithubCallbacks`, return 400 when `readSecret("GITHUB_CLIENT_SECRET")` is falsy,
before the "[critical]" log. In the login route, move the `githubOAuth` undefined check to the top
of the handler.

### IN-02: Slack redirect: a log line per request when disabled, the client secret in the URL, and an unencoded `code`

**File:** `lib/router.slack.js:24-47`
**Issue:**
- The "SLACK_CLIENT_SECRET not set" info line is logged on every request to this
  unauthenticated endpoint, not once.
- The unconditional debug lines at 24-26 also log the attacker-supplied `code`.
- When enabled, `client_secret` travels in the query string of a GET, where proxies can log
  it. `req.query.code` is concatenated without encoding, so `code=x&redirect_uri=…` injects
  parameters.

These are mostly pre-existing, and Slack OAuth is off in production.
**Fix:** Log the disabled state once (for example a module-level flag). When the route is
re-enabled, POST to `oauth.v2.access` with a `URLSearchParams` body, the same pattern as
`oauth-github.js:buildTokenRequest`.

### IN-03: `readSecret` trims file values but not env values, and an empty secret file shadows a valid env value

**File:** `lib/thinx/secrets.js:32-36` (copied in `services/worker/secrets.js`, `services/transformer/secrets.js`)
**Issue:**
- A mounted secret file is `.trim()`med, while the env fallback is returned verbatim, so the
  same credential can resolve to two different strings depending on the source.
  - For `GIT_KEY_PASSPHRASE`, deploy keys generated before this phase were encrypted with the
    untrimmed env value. If that value had leading or trailing whitespace, keys stop decrypting
    once the file wins.
  - WR-02 describes the same risk for COUCHDB_PASS and REDIS_PASSWORD.
- An existing but empty secret file (for example `docker secret create X -` fed from an empty
  pipe) yields `""`, which silently turns the integration off even though env holds a good
  value.

**Fix:** Treat an empty file as absent (fall through to env), and apply the same normalisation to
both sources, or document that env values must not carry surrounding whitespace. Apply the change
to all three copies.

### IN-04: The transformer's `app.js` and `trans.js` are unreachable, and the three copies of `secrets.js` are kept in sync by comment only

**File:** `services/transformer/app.js:1-24`, `services/transformer/trans.js:1-6`, `services/*/secrets.js`
**Issue:**
- The transformer image runs `index.js`, which requires only `transformer.js`. Nothing requires
  `app.js`, and only `app.js` requires `trans.js`, so the Rollbar changes in those two files are
  dead code. The live transformer's Rollbar behaviour comes solely from `transformer.js`.
- `readSecret` now exists in three repos with only a "keep in sync" comment. A future fix, for
  example IN-03, has to land three times.

**Fix:** Delete or clearly mark the dead transformer entry files. Consider publishing
`secrets.js` as a small shared package, or add a CI check that compares the three copies'
`readSecret` bodies.

---

_Reviewed: 2026-09-29T12:07:43Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
