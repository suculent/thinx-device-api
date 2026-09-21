---
gsd_state_version: "1.0"
milestone: v1.13
milestone_name: Web Hardening (Console/Edge) (Phase 21)
current_phase: 21
current_phase_name: CSP Wildcard Removal + Anti-CSRF Token
status: executing
stopped_at: "Phase 21 reconciled 2026-09-21; blocked on 21-04 Task 2 operator checkpoint"
last_updated: "2026-09-21T14:25:00.000Z"
last_activity: 2026-09-21
state_head: 9909d0e4fca7482c084a695f8a1941997ec31bb7
progress:
  total_phases: 4
  completed_phases: 11
  total_plans: 5
  completed_plans: 3
  percent: 60
---

# STATE — THiNX Device API

**Last updated:** 2026-09-19 (reconciled with ~123 commits that landed outside the plan flow since 2026-07-05)

## Project Reference

See: `.planning/PROJECT.md`

- **Core value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.
- **Current focus:** v1.13 Web Hardening (Console/Edge) — Phase 21 (CSP Wildcard Removal + Anti-CSRF Token) is the only phase; it must touch the swarm nginx edge and both console images (legacy AngularJS `services/console/src/default.conf` + Vue `services/console/vue/default.conf`) consistently, plus add server-side CSRF validation to the API's login route.
- **Production today (CORRECTED 2026-09-21 by direct swarm inspection):** `thinx_api` runs on **core**, `thinx_console` on **micro**, `thinx_vue` on **core** — api and classic console are the reverse of what was recorded on 2026-09-19. Original (now stale) note follows: api + transformer run on `micro`, not `core`. Classic console image `registry.thinx.cloud:5000/thinx/console:swarm@sha256:27b1ca72` on node `core`, serving the CSP build with no inline scripts; rollback digest `sha256:1906bd5f`. `thinx-staging` publishes to the private registry, `main` to Docker Hub — one registry per branch since `3cfd0666`.
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace. Phase 21 touches BOTH console images (legacy + Vue) directly since the CSP and CSRF findings are console-frontend concerns, not backend-only; coordinate submodule pointer bump as part of Phase 21 deploy.

## Current Position

Phase: 21 (CSP Wildcard Removal + Anti-CSRF Token) — in progress
Plan: 4 of 5 in the GSD flow; SEC-CSP-01 has since been carried past its plan by out-of-plan work
Status: 21-01..21-03 complete. Production now enforces `script-src` **without** `'unsafe-inline'`
        (plus `script-src-attr 'none'`) after the classic console's inline scripts were migrated to
        external assets — further than 21-03 scoped. 21-04 and 21-05 ARE written (corrected
        2026-09-21 — the earlier "still unwritten" note was wrong); what they lack is execution.
        Reconciled against live state 2026-09-21: 21-04 Task 1 (push both repos, bump submodule,
        CI green) is already satisfied and must not be re-run; 21-04 Task 2 (authenticated
        in-browser verification) is the only real gap; CSRF enforcement is confirmed still OFF.
Last activity: 2026-09-19

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** (shipped 2026-05-27) — see `.planning/MILESTONES.md`
- ✅ **v1.9 — Backend Hygiene & Posture** (shipped 2026-06-04) — Phases 5–11; see `.planning/MILESTONES.md` + `.planning/milestones/v1.9-ROADMAP.md`
- ✅ **v1.10 — Operational Closures** (shipped + archived 2026-06-05) — Phases 12–14, 5/5 requirements Verified; see `.planning/MILESTONES.md` + `.planning/milestones/v1.10-ROADMAP.md`
- ✅ **v1.11 — Backlog Drawdown** (shipped 2026-06-06) — Phases 15–17, 4/4 requirements Verified; audit `tech_debt`; see `.planning/MILESTONES.md` + `.planning/milestones/v1.11-ROADMAP.md`
- ✅ **v1.12 — Inbox Drawdown** (shipped 2026-06-29) — Phases 18–20, 4/4 requirements Verified; see `.planning/MILESTONES.md`
- 🔄 **v1.13 — Web Hardening (Console/Edge)** (roadmap created 2026-07-04) — Phase 21, 2/2 requirements mapped; phase planning pending

## Since the last state update (2026-07-06 → 2026-09-19)

~123 commits landed on `thinx-staging`/`main` outside the GSD plan flow. Grouped by theme, with
entry-point commits — none of this is reflected in a phase SUMMARY, so this list is the record:

- **Observability and privacy tooling (Jul 6–15).** Logging quality audit, made call-span aware
  (`00291f10`, `2a32b4d0`); event taxonomy centralized as one source of truth (`06fbf580`); PII
  exposure scan report plus `.gitignore` hardening (`48643a53`); privacy-policy consistency checker
  with a CI spec (`c722c9a6`); bounded severity + secret redaction in the auth modules (`1c7b8616`);
  roadmap entropy detector (`6ef99e50`).
- **Dependency and injection sweep (Sep 14–16).** socket.io family to 4.8.3, `ws` pinned 8.21.3,
  axios 1.20.0, joi/moment bumps (`d9c62c11`, `4d68d9ff`, `33e8e463`); CouchDB callback semantics
  restored on nano 11 through the new `lib/thinx/couch.js` shim (`0788a7f1`, `77b0760c`); optional
  CORS enforcement with a warning-only rollout mode (`6ac1f0da`); NoSQL injection sanitizer
  (`c0980f90`); crypto-js replaced by `node:crypto` for transmit-key decryption (`dcd8234e`);
  committed Coveralls token removed and coverage collected as CI artifacts (`aefcf8bb`, `54db7afb`);
  jasmine pinned to 5.x so the order-dependent specs stop shuffling (`b57aa986`).
- **Image and platform hardening (Sep 17–18).** Docker Hardened Images for base, worker, couchdb and
  the platformio builder (`8b6683fb`, `09fac716`, `64d32de1`, `f910b8df`); device `timezone_utc`
  feature from design spec through registration, edit, read and a backfill migration (`6c9bef79`,
  `e843b871`, `fdaa4eb7`, `f61e3341`, `de1ca0f9`, `a2d6b874`); sslheaders attached to the https
  router with a corrected trust-proxy allowlist and negotiated cookie `Secure` flag (`3574b983`,
  `2a54b977`); `docker-swarm.yml` reconciled with the deployed stack (`3cfdc034`); Snyk code, OSS and
  container monitoring wired into CI including the vendored goauth module (`0935e747` … `e8c3f21f`);
  test gate repaired so the ZZ-* tier stops being skipped (`3f9f6df3`).
- **Secrets and pipeline hygiene (Sep 19).** Every secret ENV removed from the api image and
  publishes pinned to `main` (`7a4a6fcd`) — 13 from the api image including SLACK_WEBHOOK, plus
  ROLLBAR_ACCESS_TOKEN and REDIS_PASSWORD elsewhere; AQUA_SEC_TOKEN and SNYK_TOKEN had leaked in a
  published image and were rotated. redis and transformer publish `:latest` again rather than only a
  SHA tag (`f5af5aec`), which immediately surfaced a latent crash — both redis scripts carried a
  bash shebang on an Alpine image with no bash, fixed to POSIX `sh`. One registry per branch ends the
  tag race (`3cfd0666`); all six submodules publish `main` only; console images reach Docker Hub
  through a second credential pair (`41da13d7`). OAuth authorize host allowlisted with an exact match
  (`974d389e`). Transformer sandbox: device status moved from interpolated script source to isolate
  globals, 1000 ms timeout, context release (`7e407973`), and the `POST /do` handler that never bound
  `this` (`f806d382`). npm dropped from the production image, ~204 MB (`caef2027`). Bootstrap
  3.3.7 → 3.4.1 in the legacy console (`a40a6f1a`). `master` retired in favour of `main`
  (`a2337b3b`), PR #554 merged.
- **This session (Sep 19, late).** Classic-console inline scripts migrated to external assets and
  deployed; production `script-src` now has no `'unsafe-inline'` and gains `script-src-attr 'none'`
  (`529be527`, console `33d20bca`). Three unused dependencies dropped and the dead `overrides.ip`
  entry with them (`3bce59cf`). CodeQL workflow pinned to least privilege (`79736b49`). CODEOWNERS
  added (`071893e9`). AngularJS digest guard so handlers stop aborting mid-digest — the missing
  header avatar (`87be96d1`, console `b0d514d`). codebeat removed, the service is gone (`ad103672`).
  PR #555 (`thinx-staging` → `main`) is open and ready; merging is what publishes to Docker Hub.

## Open Operational Items

Carried from the 2026-09-19 sessions, none of them blocking:

| Item | State |
|------|-------|
| PR #555 | ✅ MERGED 2026-09-19T21:34:24Z (`thinx-staging` -> `main`). Docker Hub publish triggered. |
| Aikido | Auth fixed by the operator, never exercised against a real scan. |
| Aikido branch-protection finding | Recommendation stands: accept-risk the *review* requirement (solo maintainer — GitHub forbids self-approval, so requiring approvals hard-blocks every merge) and enforce status checks, signed commits (already 100% `G`) and no force-push/deletion instead. Same reason CODEOWNERS must not be paired with "Require review from Code Owners" yet. |
| Private registry flakiness | `docker login registry.thinx.cloud:5000` timed out in two consecutive pipelines on 2026-09-19, both times while another job was pushing an image to it. Both passed on rerun. Worth a retry wrapper on the login step or more I/O headroom on `micro`. |
| CodeQL workflow staleness | Still triggers on the deleted `master` branch, so only the weekly schedule fires; `github/codeql-action/*@v1` was retired in Jan 2023 and `actions/checkout@v2` is two majors behind. |
| `couchdb` / `console-build-env` images | Not refreshed — nothing has been pushed to them. |
| `Dockerfile.test` secrets as ENV | Deliberate. That image is never published. |
| Aikido triage | Not possible on this plan: Code Quality is not in the free tier, so the issue feed (`400 — only available for paying customers`), the dashboard list and `aikido_ignore_issue` are all unavailable — the ignore call accepts an id and changes nothing, verified by re-scanning. What does work is the autofix bot (it produced #556), the two commit checks, and the on-demand local scan via `aikido_scan_paths`, which is fresher than the platform's ~3-day sweep. Verified noise therefore lives in `scripts/aikido-known-false-positives.json` and is filtered by `scripts/aikido-filter.js`. |
| `lib/thinx/git.js:71` / `:153` | Deliberately NOT in the false-positive list. The `execSync(<string>)` sink is unchanged — the contract is a shell script string because of the `ssh-agent sh -c` wrapper — and the mitigation (`a1e7fbe3`) is at the callers, which now allowlist and `shell-escape` every value. Leave it visible in scan output until the sink itself takes argv, or suppress it deliberately as accepted-risk. |
| `lib/thinx/builder.js` path traversals | Aikido flags `readFileSync`/`lstatSync` on paths inside the build directory the builder created (lines ~428, 449, 682, 731, 1197). Today's work removed the two `require(variable)` sinks and put the platform name behind an allowlist; these are untouched and are the reasonable next task. |
| Snyk `snyk-monitor-console-classic` | Green as of 2026-09-19 (the missing `dockerhub` context was the original cause; the later failure was the registry timeout above). |

## Deferred Items

Items acknowledged and deferred at prior milestone closes and carried forward:

| Category | Item | Status |
|----------|------|--------|
| quick_task | 260531-n72-fix-the-latent-bugs-in-apikey-js-and-har | scanner false-positive (work shipped via `/gsd-quick`, commit `fae0efbd`; manifest format unreadable by scanner) |
| quick_task | 260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign | scanner false-positive (work shipped via `/gsd-quick`, commit `08e4dbd7`; manifest format unreadable by scanner) |
| quick_task | 260605-lix-fix-device-check-in-lastupdate-not-persi | scanner false-positive (work shipped via `/gsd-quick`, commit `6b4a077c`; manifest format unreadable by scanner) |
| verification_gap | Phase 15 (15-VERIFICATION.md status human_needed) | Accepted at v1.11 close. Full Jasmine suite is Docker-gated (`/mnt/data/conf/config.json` absent in dev); 5/5 code must-haves verified directly. Validates on CI push of `thinx-staging`. |
| follow_on | Land v1.11 fix on thinx-staging + deploy 15/16 | The view-warmup fix + all v1.11 commits are CI-green on `thinx-unit` (pipeline 5271). Pushing to `thinx-staging` triggers deploy pipeline. Deliberate operator step. |
| future_req | TEST-CHAI-01 | Deferred 4th+ time (deliberate keep call). chai-http v5 ESM locked per AGENTS.md; trigger = superagent v3 CVE. |
| future_req | OPS-02 | Deferred 4th+ time (deliberate keep call). Stale swarm memberlist entry `b356ad8e1d60` — pure swarm-side OPS orthogonal to this codebase. |
| future_req | OPS-03 | Deferred 4th+ time (deliberate keep call). 4 stack services with malformed `<image>@` autoredeploy specs — pure swarm-side OPS. |
| future_req | uuid #194 | `deferred-dev-only` (transitive `uuid@8` in nyc/jest-junit; 8→11 bump risks dev toolchain). Revisit if tools bump their pin or alert escalates to runtime scope. |
| out_of_scope | CONSOLE-LEGACY-JSON-PARSE | Reclassified to `services/console` submodule scope at v1.11 start. Frontend double-parse at `src/login.js:173` + `password.js:87`; no parent-repo code angle. |
| out_of_scope (v1.12) | GH-03 (console UI for GitHub token) | Vue Profile screen to enter/replace/clear GitHub token — owned by `services/console/.planning/`. Out of scope for Phase 19. |
| out_of_scope (v1.12) | SEC-CFG-02 (full readSecret sweep) | ~20 remaining sensitive env vars beyond core Redis/CouchDB. Phase 20 proved the pattern with core creds first; full sweep deferred. |
| deferred_v1.13 | SEC-CSP-02 (`unsafe-eval` removal) | Blocked on AngularJS console retirement — `$parse` requires `unsafe-eval` unless CSP mode. Revisit once console fully migrated to Vue. |

## Accumulated Context

### Decisions

- 2026-07-04 — v1.13 ROADMAP shape: 1 phase (21), granularity coarse. SEC-CSP-01 (CSP scheme-wildcard removal) and SEC-CSRF-01 (login-form anti-CSRF token) combined into a single Phase 21 rather than split, because both changes touch the identical three deploy surfaces (nginx edge, legacy console image, Vue console image), share the same "keep both consoles + edge mutually consistent" verification concern, and ship through the same console-submodule deploy pipeline. Splitting would duplicate the two-console-consistency check and the HawkScan-rescan verification for no delivery-boundary benefit.
- 2026-07-04 — Phase numbering: v1.13 continues from v1.12's last phase (Phase 20). Phase 21 = v1.13 work. No `--reset-phase-numbers`; linear monorepo history preserves cross-milestone traceability.
- 2026-07-04 — `unsafe-eval` removal explicitly deferred as SEC-CSP-02 (not folded into Phase 21) — AngularJS's `$parse` requires `unsafe-eval` unless run in CSP-safe mode; removing it now would break the legacy console outright. Tracked as a future requirement, blocked on the console leaving AngularJS.
- 2026-07-04 — API-side CSRF for token-authenticated routes explicitly out of scope — those routes use `X-Access-Token`/JWT (not ambient cookies) and aren't CSRF-prone; only the cookie-session login forms need the synchronizer token.
- 2026-06-29 — v1.12 shipped 4/4 requirements across Phases 18–20 (SEC-PII-03, GH-01, GH-02, SEC-CFG-01); console submodule bumped for GitHub-token UI + 11 nightshift/chore branches.
- [Phase 21]: issueCsrfToken never re-invokes ensureXsrfCookie/crypto.randomBytes -- it only reads the cookie the global middleware already set, so the priming GET never emits a second Set-Cookie
- [Phase 21]: verifyCsrfToken wired onto exactly the 7 reconciled protected routes (adds the Vue v2 password reset/set routes the original D-02 list omitted); X-Access-Token/JWT routes and /api/v2/user left untouched
- [Phase 21]: Console CSRF wiring uses two shared seams (classic $.ajaxSetup, Vue composeHeaders()) rather than per-call-site edits — Prevents future whack-a-mole regressions found across 4 plan-check passes
- [Phase 21]: SEC-CSP-01: pinned CSP host allowlist across console images + runbook snapshots, replacing the https:/wss: scheme wildcard — unsafe-inline/unsafe-eval left unchanged per source; SEC-CSP-02 deferred

### Todos

- ~~Reconcile Phase 21 with reality before closing it~~ **DONE 2026-09-21.** Findings recorded in a `## RECONCILIATION WITH DEPLOYED REALITY` block at the top of both `21-04-PLAN.md` and `21-05-PLAN.md`. Summary: 21-04 Task 1 already satisfied (csrf.js on `origin/thinx-staging` + `origin/main`, HEAD==origin 0/0, submodule `acb62d82` 0/0, PR #555 merged 2026-09-19T21:34:24Z, and `app.thinx.cloud` live-mints `XSRF-TOKEN; Domain=.thinx.cloud; Secure; SameSite=Lax`). Enforcement confirmed still fail-open (`POST /api/login` sans token -> `invalid_credentials`, not `csrf_token_invalid`). Both plans' dead `$HOME/.claude/get-shit-done/...` execution-context paths repointed to `~/.claude/gsd-core/...`.
- **NEW (2026-09-21) — Vue console CSP does not match its own image config.** `console.thinx.cloud` serves a CSP byte-identical (modulo order) to the CLASSIC `services/console/src/default.conf`, not to `services/console/vue/default.conf`; both console hosts return one identical CSP header. So 21-03's edit to `vue/default.conf` has no observable production effect. Determine what actually emits that header (edge nginx vs image) in 21-04 Task 2 step 0.
- **NEW (2026-09-21) — latent cold-session lockout.** `services/console/vue/default.conf` `connect-src` omits `https://app.thinx.cloud` and `wss://app.thinx.cloud`. If that file ever takes effect, the Vue console's cross-origin `GET /api/v2/csrf-token` prime is CSP-blocked — the exact lockout 21-05's must_haves forbid. Masked today only because the live classic CSP lists both hosts. Fix before flipping enforcement if `vue/default.conf` is (or becomes) authoritative.
- **NEW (2026-09-21, swarm-verified) — TOPOLOGY HAS DRIFTED; 21-04 Task 2 step 0 is a live BLOCKER.** Actual placement now: `thinx_api` on **core**, `thinx_console` on **micro**, `thinx_vue` on **core**. Both the plans and this file's "Production today" line assert the opposite for api/console (api on micro, classic console on core). Per 21-04 Task 2 step 0's own instruction ("If the live mapping has drifted from this, STOP and treat it as a blocker — do not guess"), verification cannot be signed off until this is reconciled. All three services were observed mid-reschedule (`Preparing`) at 14:3x and settled to `Running`; all three hostnames return HTTP 200 and `app.thinx.cloud` still mints `XSRF-TOKEN`. `docker service ls` on the leader returns an *unstable subset* across consecutive polls — query services by name, not by listing.
- **NEW (2026-09-21, swarm-verified) — the `thinx/console:vue` image does not contain `vue/default.conf`.** Root cause of the CSP mismatch above: it is NOT an edge override. The running `thinx_vue` container's baked `/etc/nginx/conf.d/default.conf` carries the CLASSIC CSP (cloudfront + gravatar + githubusercontent), which `vue/default.conf` has never contained on ANY branch (`origin/main`, `origin/thinx-staging`, HEAD all show `cloudfront=0`) across its last 10 revisions. The image is NOT stale — it was built **2026-09-21T11:18:57Z**. CI config is correct (`docker-context: vue`, `dockerfile: vue/Dockerfile`, and `vue/Dockerfile:94` does `COPY default.conf`). So a fresh build is somehow not picking up the repo's `vue/default.conf` — unexplained, and it must be explained before 21-05 flips enforcement. Also noted: the image carries `NGINX_HOST=rtm.thinx.cloud`, i.e. the Vue image was built with `WEB_HOSTNAME` pointing at the *classic* console's hostname. Secondary evidence: `connect-src` in `vue/default.conf` DID list `app.thinx.cloud` at commits `cd2731f`/`b793bb8` and was dropped by later commits — the omission is a regression, not an original oversight.
- **NEW (2026-09-21) — runbook snapshots stale.** `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.{pre,post}.nginx:29` still record 21-03's CSP (`'unsafe-inline'` in `default-src`, no `app.thinx.cloud`, no split `script-src`/`style-src`, no `script-src-attr`). Refresh against the live header during 21-05.
- Authenticated in-browser verification of the CSP build has never run against the deployed instance — the pre-deploy Playwright suites (`src/test/csp/browser.cjs`, `app-browser.cjs`) cover it with fixtures only. That is the one real gap in 21-04.
- Before closing Phase 21: confirm the Crisp widget (`wss://client.relay.crisp.chat`) and any other explicit-host dependents are enumerated and pinned in the new CSP — a missed host will silently break a console feature post-deploy.
- Coordinate `services/console` submodule pointer bump as part of Phase 21's deploy (both console images change).

### Blockers

- None.

### Open Questions

- None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260531-n72 | Fix latent bugs in apikey.js + harden node-redis client + Slack outage notifier (incident response to 2026-05-31 14:19 UTC thinx_api OOM) | 2026-05-31 | fae0efbd | [260531-n72-fix-the-latent-bugs-in-apikey-js-and-har](./archive/quick/260531-n72-fix-the-latent-bugs-in-apikey-js-and-har/) |
| 260531-pdi | Refresh LE intermediate allowlist (R10..R14) in thinx-core.js cert rotation-tolerance branch — silences startup SSL verification error caused by R13-issued leaf vs R10-pinned chain | 2026-05-31 | 08e4dbd7 | [260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign](./archive/quick/260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign/) |
| 260605-lix | Device check-in did not persist top-level lastupdate (console showed stale "last connected"): `update_device_and_respond` wrote a nested `doc.changes` blob via the flat-merge `devices/modify` handler; also `runDeviceTransformers` had no else branch for transformer-less devices. Fixed both + DeviceSpec (04b) regression. Root cause proven on prod doc 04ed1650. | 2026-06-05 | 6b4a077c | [260605-lix-fix-device-check-in-lastupdate-not-persi](./archive/quick/260605-lix-fix-device-check-in-lastupdate-not-persi/) |
| 260605-inf | Influx stats fix (v1.10 OBS addition): dashboard check-in numbers read 0/stale + API log spammed `error parsing query: found BADSTRING`. Fixed `lib/thinx/influx.js` — tag mismatch (write `owner` vs read `owner_id`), malformed time predicates (stray `'`, Date/number → `'<ISO>'` / `now() - 7d`), `mean`→`count`, `${measurement}`→`${kpi}` loop index, removed malformed helper queries. Return shape preserved (statistics.js + Visits.vue compatible). CI green (pipeline 5266). Live in prod (autoredeployed). | 2026-06-05 | 9b6d931c | (loose commit — folded into v1.10, no quick-task dir) |
| 260619-lgl | OAuth login failed from the Vue console: Google/GitHub buttons hit `/api/v2/oauth/{google,github}` (Vue API base is `/api/v2`) but the backend only mounted `/api/oauth/*` → `404 Cannot GET`. Dual-mounted the OAuth initiator+callback routes under `/api` and `/api/v2` (parity with `/login`+`/logout`); `redirect_uri` unchanged. Issue #2 (`/static/gdpr.html` 404) is deploy-lag — API code already serves it (`thinx-core.js:433`), ships on deploy. Console pin left at `1191184b`. Deployed via `thinx-staging`. | 2026-06-19 | b92f7c76 | [260619-lgl-oauth-v2-routes-gdpr-static](./archive/quick/260619-lgl-oauth-v2-routes-gdpr-static/) |

## Cross-Project Touchpoints

- **`services/console/.planning/`** — Vue console GSD workspace (sibling project). Phase 21 directly touches this submodule's Vue console image (`services/console/vue/default.conf` CSP + login-form CSRF token wiring) — coordinate with the console GSD project rather than treating it as fully external for this phase.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.
- **`.planning/runbooks/swarm-configs/`** — Phase 21 edits `rtm.thinx.cloud-server.pre.nginx` and `.post.nginx` (line 28 CSP header); the runbook snapshot trail pattern from v1.9/v1.10 applies here too.

## Session Continuity

**Last session:** 2026-09-21T14:07:57.908Z

**Stopped at:** Phase 21 reconciled against deployed reality (2026-09-21); execution blocked on an
operator-only checkpoint.

**Next action:** Execute 21-04 Task 2 — the authenticated in-browser verification of both consoles
(blocking `checkpoint:human-verify`, needs a real staging login + DevTools + a swarm `docker service ps`).
Task 1 of 21-04 is already satisfied; do not re-run it. Only after that checkpoint passes may 21-05
flip `debug.csrf_enforce` / `CSRF_ENFORCE` on the `thinx_api` service.

---
*v1.0 GA backend closures shipped and archived: 2026-05-27 (4/4 v1 requirements Verified)*
*v1.9 Backend Hygiene & Posture shipped and archived: 2026-06-04 (13/13 v1.9 requirements Verified across 7 phases)*
*v1.10 Operational Closures shipped and archived: 2026-06-05 (5/5 v1.10 requirements Verified across 3 phases [12–14])*
*v1.11 Backlog Drawdown shipped and archived: 2026-06-06 (4/4 v1.11 requirements Verified across 3 phases [15–17])*
*v1.12 Inbox Drawdown shipped 2026-06-29 (4/4 v1.12 requirements Verified across 3 phases [18–20])*
*v1.13 Web Hardening (Console/Edge) roadmap created: 2026-07-04 (2/2 v1.13 requirements mapped into 1 phase [21], granularity coarse)*
</content>
