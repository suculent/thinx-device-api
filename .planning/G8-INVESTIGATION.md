# G8 — `POST /api/v2/password/reset` returns 403 on rtm (kick-off note)

**Filed:** 2026-05-26
**Source:** Phase 11 Wave 1, `services/console/.planning/ROADMAP.md` L366 (console submodule)
**Status:** Not started — investigation seed only
**Owner:** parent monorepo (`thinx-device-api`), not the console submodule
**Related:** Phase 11 Wave 2 (G9 Vue selection-prune) shipped 2026-05-26 via console quick task `260526-2d3` (commit `1a467f1`); parent submodule bumped at `382cebfc`.

---

## Problem statement

- The Vue console's "Forgot password?" flow posts `email` to `POST /api/v2/password/reset` to start a reset (sends an email with a reset key, then a follow-up GET/POST round-trip sets the new password).
- Against the **rtm** environment (`https://rtm.thinx.cloud`), that POST returns **403**.
- The **legacy** AngularJS console hit the same endpoint successfully *without* an authenticated session. So the route is intended to be public (no session, no CSRF token).
- Likely a middleware/edge regression, **not** a route redesign. Route handler in `lib/router.user.js:144-146` is unchanged for the last ~12 months (only diff since 2025-01-01 is `0514f6ea`, which touched `postChat`, not the reset path).

---

## Quick recon already done (2026-05-26)

What I checked without writing code:

| Layer | Finding |
|---|---|
| Route definition | `lib/router.user.js:144` `app.post("/api/v2/password/reset", postPasswordReset)` — no `requireSession` / `requireAdmin` middleware on the route line. Aliased at `/api/user/password/reset` (legacy path, line 202) for the same handler. |
| Router mount order | `thinx-core.js:358` mounts `router.user.js` after `sessionParser` (L316), `express.json` (L318), `express.urlencoded` (L328), and the rate limiter (L325 — only when not in test). No global session-required guard between mount and the route. |
| Rate limiter | `express-rate-limit` at `thinx-core.js:75`. Default body returns **429**, not 403, so the rate limiter is unlikely the culprit unless a custom handler reshapes the response. |
| CSRF middleware | `grep -rn "csrf\|csurf"` on `lib/` + `thinx-core.js` → **zero hits**. No CSRF stack in the Node app. |
| Helmet / CSP | Need to verify (`grep helmet thinx-core.js`). |
| Edge proxy | The 403 may originate from Traefik or nginx in front of the Node app. AGENTS.md L26 records CSP and CORS edits in nginx and `lib/router.js`. |
| CORS origin reflection | AGENTS.md L27: "Backend CORS bug was fixed in `lib/router.js` by reflecting request origins instead of returning `*` with credentials." If origin reflection now requires a session-bound origin, a fresh (unauthenticated) request from the console could be rejected — *but the standard CORS rejection is at the browser, not a server-side 403*. Worth a `curl -v -H 'Origin: https://rtm.thinx.cloud' ...` trace to confirm where the 403 is stamped. |

---

## First moves for the next session

Suggested order — cheap → expensive:

1. **Reproduce on rtm with curl** (confirms the route layer it dies at):
   ```bash
   curl -sS -i -X POST https://rtm.thinx.cloud/api/v2/password/reset \
        -H 'Content-Type: application/json' \
        -H 'Origin: https://rtm.thinx.cloud' \
        --data '{"email":"someone-known-to-not-exist@example.com"}'
   ```
   - **200 + JSON body** → bug is in the Vue client side (CORS preflight failing, wrong path, wrong content-type) — re-investigate in the console submodule.
   - **403** → server-side. Check response body and headers (especially `Server`, `X-Powered-By`, custom error keys) to tell Express vs Traefik vs nginx.
   - **404 / connection reset** → routing regression on rtm only; compare with `https://rtm.thinx.cloud/api/user/password/reset` (the legacy alias).

2. **Run the same call against staging** (`stg.thinx.cloud` or whatever the current staging hostname is) to confirm whether this is environment-specific or codebase-wide.

3. **Check edge config on rtm:**
   ```bash
   ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020
   # Look at swarm:
   cd /mnt/gluster/deployment/swarm
   # Inspect Traefik labels and nginx config for /api/v2/password/* paths
   ```
   See AGENTS.md L17-L19 for ssh details.

4. **If reproducible locally**, bisect against the last working state. The console-side console-tap on the reset flow was working before May 2025 (the most recent code touch on `router.user.js` is from May 7 2025; the legacy console worked before then). Compare `thinx-core.js` middleware order against the last known-good tag.

5. **Once root-caused**, the fix probably lands in one of:
   - `thinx-core.js` (middleware order or app-level guard)
   - `lib/router.js` (CORS origin reflection or a global validator)
   - Traefik labels in `/mnt/gluster/deployment/swarm`
   - nginx config for `rtm.thinx.cloud`

   Add a regression test in `spec/ZZ-*` covering an unauthenticated `POST /api/v2/password/reset` returning 2xx for a non-existent email (matching legacy behavior).

---

## UAT (cross-reference)

From console-side `.planning/ROADMAP.md` L392:

> Logout → `/#/login` → Forgot password? → enter email → Send reset email. `POST /password/reset` returns 200; success message shown; reset email received; reset_key round-trip works; new password logs in.

The Vue console expects 200 + success message. Status quo (403) breaks PROF / AUTH UAT for any user who lost their password.

---

## Phase 11 status snapshot

| Wave | Item | Repo | Status |
|------|------|------|--------|
| 1 | G8 — `POST /api/v2/password/reset` 403 | parent monorepo (this) | **Not started** — investigation seed only (this doc) |
| 2 | G9 — Devices.vue per-row Revoke selection-prune | console submodule | **Code shipped** 2026-05-26 (`4be39f3`); deployed via parent bump `382cebfc`; live UAT pending next bundle |

Phase 11 as a whole (defined in `services/console/.planning/ROADMAP.md` L357) is gated on Wave 1.

---

## Notes

- This is a **kick-off seed**, not a GSD phase artifact. The parent monorepo does not currently have a `PROJECT.md` / `ROADMAP.md` / `STATE.md` triad. If someone wants to formalize G8 as a parent-monorepo GSD phase, run `/gsd:new-project` from this repo root and import this file as the Phase 11 starter context.
- The console-side artifacts for the broader Phase 11 (which contains both G8 and G9) live in `services/console/.planning/phase-11/` (currently empty) and `services/console/.planning/ROADMAP.md` (L357 onward). Wave 1 was always intended to land here; the console's empty `phase-11/` directory is expected.
- Three commits in the 2026-05-26 deploy unit are intentionally unsigned by user authorization (GPG pinentry was unreachable that session): console `4be39f3` + `1a467f1`, parent `382cebfc`. Not a security event; can be amended with `-S` later if downstream tooling complains.
