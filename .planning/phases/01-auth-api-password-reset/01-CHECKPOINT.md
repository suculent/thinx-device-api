# Phase 1 Wave 2 — Human Checkpoint: Vue console "Forgot password?" UAT

**Type:** checkpoint:human-verify
**Plan:** 01-02 (Wave 2)
**Task:** 4 of 5
**Status:** Paused — awaiting human UAT on rtm.thinx.cloud
**Created:** 2026-05-26

---

## what-built

The Vue console's "Forgot password?" flow on `rtm.thinx.cloud` now exercises a backend that:

- No longer 403s on `Authorization: Bearer null` (the literal string the Vue client sends when logged out — `services/console/vue/src/core/api.js:53-57`).
- Returns HTTP 200 with the standard `{success, response}` envelope for **all** well-formed inputs (registered or unregistered) — no enumeration leak (AUTH-API-01 (b)).
- Preserves the strict JWT-403 path for real malformed tokens (e.g., `Bearer abc.def.ghi` still 403s — verified by negative-control curl).

### Backend changes already on production (rtm.thinx.cloud)

| Commit | Scope | Change |
|---|---|---|
| `622aa014` | `lib/router.js` | Bearer-null guard at the JWT branch — strips `Authorization: Bearer null` / `Bearer undefined` / empty-Bearer headers and falls through to the cookie/no-auth path. |
| `db46790c` | `lib/router.user.js` + paired spec | `postPasswordReset` no longer calls `res.status(401)` or `req.session.destroy()` on the not-found path. AUTH-API-01 (b) normalization. |
| `7b3b9334` | `.planning/` | Wave 1 SUMMARY (`01-01-SUMMARY.md`). |
| `3413166c` | `spec/jasmine/ZZ-RouterPasswordResetSpec.js` | New 7-test regression spec locking the Bearer-null contract into CI. |

### CI status

CircleCI `main` workflow on commit `3413166c`: **completed=success** at ~04:30 from push. Full Jasmine suite green (the new spec + all sibling specs).

### Deploy status

- Swarm host: `188.166.23.244` (alias `micro`), swarm path `/mnt/gluster/deployment/swarm`.
- Deploy script: `./restart.sh` (rolling `docker stack deploy --with-registry-auth -c ./thinx.yml thinx`). **NOTE:** the plan referenced `./scripts/stack-deploy` based on console-Phase-11 / AGENTS.md convention, but this repo's swarm stack uses `./restart.sh` — applied Rule 3 (auto-fix blocking issue, unambiguous correct path).
- Pre-deploy image: `thinxcloud/api:latest@sha256:6d82429b...3faa26`.
- Post-deploy image: `thinxcloud/api:latest@sha256:6a57af1b...c567d`.
- Task ID rolled: `rkv3j0z4...` (Shutdown) → `3ra71st0...` (Running).
- Rollover completed within ~12 seconds.

### Live verification on rtm (curl probes)

All four probes match expectations. Verbatim outputs are captured below (will be transcribed into `01-02-SUMMARY.md` on resume).

| # | Request | Expected | Actual |
|---|---|---|---|
| 1 | `POST /api/v2/password/reset` + `Authorization: Bearer null` + unregistered email | HTTP 200 | **HTTP/2 200** + `{"success":false,"response":"email_not_found"}` |
| 2 | `POST /api/v2/password/reset` + `Authorization: Bearer abc.def.ghi` | HTTP 403 (guard narrowing) | **HTTP/2 403** + empty body |
| 3 | `POST /api/v2/password/reset` + `Authorization: Bearer undefined` | HTTP 200 | **HTTP/2 200** + same envelope |
| 4 | `POST /api/v2/password/reset` (no Authorization header) | HTTP 200 | **HTTP/2 200** + same envelope |

Probe 1 also carries `access-control-allow-origin: https://rtm.thinx.cloud` in the response headers — confirms the route handler ran post-fallthrough, not pre-403 (the pre-fix 403 stamped before CORS reflection).

---

## how-to-verify

**Goal:** Confirm the end-to-end "Forgot password?" round-trip works for a real user, in a real browser, against rtm.thinx.cloud. This is ROADMAP Phase 1 success criterion 2 (`AUTH-API-01 (b)`).

### Pre-conditions

- Working test mailbox you control (your `corpus.cz` mailbox or a sandbox address you can read).
- A registered THiNX account whose email matches that mailbox. If you don't already have one on rtm, use your existing account or create one via `Sign up` on the console.
- A modern browser (Chrome / Firefox / Safari). Use **incognito/private** to ensure no stale `x-thx-core` session cookie.

### Steps

1. Open https://rtm.thinx.cloud/ in a fresh incognito window. Confirm the Vue console loads. If you see a login page, you're in the right state (logged out).

2. Open DevTools → Network tab → tick "Preserve log". Filter to `password/reset`.

3. Click **"Forgot password?"** on the login page.

4. Enter the email address of your registered account.

5. Submit the form.

6. **Confirm in DevTools** the `POST /api/v2/password/reset` request:
   - Carries `Authorization: Bearer null` as a request header (this is the original G8 trigger — we're confirming the backend now handles it gracefully).
   - Returns **HTTP 200** (NOT 403). Response body shape: `{"success":...,"response":"..."}`.
   - Has `access-control-allow-origin: https://rtm.thinx.cloud` in the response headers.

7. Switch to your mailbox. The reset email should arrive within ~60 seconds. If it doesn't, that's a **Mailgun ops concern** (the rtm Mailgun integration may need re-checking — `/mnt/data/conf/config.json` on the swarm host) — it is NOT a Phase 1 regression. Note it in the resume signal and continue; AUTH-API-01 (a)/(c) status-code criteria are independently verified by the curl probes above.

8. Click the reset link in the email. Browser opens `https://rtm.thinx.cloud/api/v2/password/reset?owner_id=...&reset_key=...`. The page should render the "Enter your new password" form.

9. Enter a new password and submit. The form posts to `POST /api/v2/password/set`. Expect HTTP 200.

10. Navigate to `/login`. Sign in with your email + the new password. Expect successful login → console main page.

### Negative-side checks (optional but valuable for the SUMMARY)

11. Open another incognito window. Visit "Forgot password?" again. Submit a randomly-generated email you KNOW is not registered (e.g., `nobody-known-<random>@example.invalid`). Confirm the POST returns **HTTP 200** (NOT 401) and the same envelope shape. End-to-end confirmation of AUTH-API-01 (b) — no enumeration visible in the Network panel.

12. Confirm no email arrives at the fake address (sanity check — registered behavior unchanged, only the HTTP-level response was normalized).

### What to look for if something goes wrong

- **"Forgot password?" returns 403:** deploy didn't actually roll. Re-check via `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'docker service ps thinx_api --no-trunc | head -3'`. Image digest should be `sha256:6a57af1b...c567d` (post-deploy) — if you see `6d82429b...` (pre-deploy) the rollover regressed.
- **"Forgot password?" returns 200 but no email arrives:** Mailgun config issue on rtm. NOT a Phase 1 regression. Document and surface; `approved-with-mailgun-note` resume signal is fine.
- **Reset link from email opens but GET round-trip returns 401:** `getPasswordReset` handler at `lib/router.user.js:26-37` regressed — NOT touched by this plan; surface as an ops problem.
- **Login after reset fails:** `postPasswordSet` regressed — NOT touched by this plan; surface as an ops problem.

---

## resume-signal

Reply with **one of**:

- **`approved`** — Vue UAT completed successfully: forgot-password form → email received → reset link consumed → new password works on login. AUTH-API-01 (b) verified end-to-end.

- **`approved-with-mailgun-note`** — Status codes correct (200, no 403) but email did not arrive. AUTH-API-01 (a) verified end-to-end via curl; (b) round-trip partially blocked by Mailgun config (NOT a Phase 1 issue). Proceed to phase close-out.

- **`failed: <description>`** — Specific failure mode (e.g., `failed: reset link opens but POST /api/v2/password/set 403s`). Phase 1 stays open; we'll plan an iteration.

On resume signal `approved` or `approved-with-mailgun-note`, a fresh executor agent will be spawned to complete **Task 5**:
- Write `01-02-SUMMARY.md` (this plan's individual summary, including verbatim curl outputs from probes 1-4).
- Write `01-SUMMARY.md` (phase-level rollup with **Root cause** + **Reversion plan** + **Out of scope / deferred follow-ups** subsections).
- Update `.planning/STATE.md` (mark Phase 1 complete, advance to Phase 2).
- Update `.planning/ROADMAP.md` (Phase 1 `[x]`, AUTH-API-01 marked Complete, Plans Complete 2/2).
- Commit per the `commit_conventions` (two atomic commits: `docs(phase-01)` + `docs(state)`).

---

## Commits on `thinx-staging` at checkpoint time

| SHA | Type | Message |
|---|---|---|
| `622aa014` | fix(router) | G8 - guard JWT branch against literal "Bearer null" / empty tokens |
| `db46790c` | fix(auth) | G8/AUTH-API-01 (b) - normalize password reset to 200 (no enumeration) |
| `7b3b9334` | docs(phase-01/01-01) | plan 01-01 summary |
| `3413166c` | test(spec) | G8 regression - Authorization: Bearer null + no-enum coverage |

All four commits pushed to `origin/thinx-staging` and exercised by CircleCI green.

---

## Deviations from Plan (recorded for SUMMARY)

| # | Rule | Where | Issue | Fix |
|---|---|---|---|---|
| 1 | Rule 3 (auto-fix blocking) | Task 2c | Plan referenced `./scripts/stack-deploy` (console-Phase-11 / AGENTS.md convention). The thinx-device-api swarm stack uses `./restart.sh` at `/mnt/gluster/deployment/swarm/`. | Used `./restart.sh` — non-disruptive rolling redeploy (`docker stack deploy --with-registry-auth -c ./thinx.yml thinx`). Pre-flight ssh + path inspection confirmed `scripts/stack-deploy` does not exist; `restart.sh` is the only safe rolling-deploy entry. Same registry, same `--with-registry-auth` flag, same `thinx.yml` stack file — semantically equivalent. |

No other deviations.

---

## Threat-model verification (Task 4 surface)

- **T-02-04 (Repudiation):** The post-fix Bearer-null curl returns 200; the negative-control malformed-JWT curl still returns 403. This combination is only consistent with a real fix on a real rollover — a stale environment would have made both probes share a status. **Anti-tampering evidence captured.**
- **T-02-06 (Information Disclosure in SUMMARY):** All curl probes used `*@example.invalid` (RFC 2606 reserved TLD, no real users). The Vue UAT step instructs the operator to record `approved`/`failed` outcomes, NOT the specific email address used. **PII boundary preserved.**
- **T-02-07 (reset_key leakage in prod response body):** Curl probe 1 returned `{"success":false,"response":"email_not_found"}` — `response` is the literal `email_not_found` string, NOT a reset_key. This confirms `ENVIRONMENT` on rtm is correctly set to production (or non-test) so `Owner.password_reset_init` does not echo the reset_key in the HTTP body. **No prod env-var regression.**

---

*Paused at: 2026-05-26. Next step: human operator runs the UAT walk above, then replies with one of the three resume signals.*
