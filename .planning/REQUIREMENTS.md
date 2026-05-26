# Requirements: THiNX Device API — v1 GA Backend Closures

**Defined:** 2026-05-26
**Core Value:** The IoT device API stays available and trustworthy through v1.0 GA — every legacy-console capability that the Vue console depends on must continue to work end-to-end, with no v1.x backlog item promoted into the v1 release.

## v1 Requirements

Requirements for closing v1.0 GA from the backend side. Each maps to exactly one roadmap phase. Sibling to the console submodule's v1.0 frontend requirements (`services/console/.planning/REQUIREMENTS.md`).

### Authentication API (Backend)

- [x] **AUTH-API-01** ✓ Verified 2026-05-26 (Phase 1 — see `phases/01-auth-api-password-reset/01-SUMMARY.md`): Unauthenticated `POST /api/v2/password/reset` returns 200 with the standard success body for a well-formed `{email: string}` JSON payload from a browser origin, restoring legacy-console behavior. Behavior must match for both registered and unregistered emails (no enumeration). Validated by: (a) ✓ `curl -X POST https://rtm.thinx.cloud/api/v2/password/reset` returns 200 + identical body for registered vs. unregistered, (b) ✓ Vue console "Forgot password?" round-trip completes end-to-end on rtm against image `0a0e6b32`, (c) ✓ regression spec at `spec/jasmine/ZZ-RouterPasswordResetSpec.js` covers the unauthenticated 200 path including `Authorization: Bearer null`. Root cause: Vue API client unconditionally sets `Authorization: Bearer null` when logged out; `lib/router.js:103` matched on header presence (not validity), failed JWT verify on literal `"null"`, stamped 403 at L132. Fixes: class-fix in `lib/router.js` (Bearer-null guard, commit `622aa01`) + no-enum body normalization in `lib/router.user.js` (commits `db46790` + tightening `c67d9af`). Cross-ref: `.planning/G8-INVESTIGATION.md`, console Phase 11 Wave 1.

### Operations

- [x] **OPS-01** ✓ Verified 2026-05-26 (Phase 3 — see `phases/03-swarm-auto-pull/03-SUMMARY.md`): Swarm-side auto-pull on `188.166.23.244` restored. Pushing an updated image tag (a no-op commit triggering CircleCI build-api-cloud) results in the swarm task picking up the new image without requiring manual `./restart.sh` workaround. Observed SLA: t2 − t0 = **63 seconds** (target ≤ 300s; 237s under budget). Validated by: (a) ✓ root cause documented — Swarmpit 1.9 watcher process entered a silent degraded state (container Running but app deadlocked, HTTP 502 via Traefik, zero logs for 30+ hours, zero autoredeploy emits); (b) ✓ controlled push-and-observe verification — commit `8a09d42f` triggered CI image `sha256:81b22f1f...`, watcher logged `autoredeploy fired! DIGEST: [ 950043b4 ] -> [ 81b22f1f ]` at 16:29:36 UTC, new swarm task Running at 16:29:39 UTC; (c) ✓ reversion plan documented (rollback via `docker service rollback swarmpit_app`; runbook line in `AGENTS.md` § "Swarm Auto-Pull Recovery"). Fix: `ssh ... "docker service update --force swarmpit_app"` (Rung 1 of 4-rung ladder; Rungs 2/3/4 NOT exercised). Zero source-code commits this phase — operational fix only. Cross-ref: console `v1.x-backlog.md` (OPS-swarmpull), incident 2026-05-25 14:44 CET.

### Security & Compliance

- [x] **SEC-DEP-01** ✓ Verified 2026-05-27 (Phase 4 — see `phases/04-dependency-triage/04-SUMMARY.md`): All 11 high-severity (and a triage pass over the 17 moderate) GitHub dependabot findings against the `suculent/thinx-device-api` default branch are classified as either v1-blocker (fixed before milestone close) or v1.x-deferred (moved to a backlog file with rationale and trigger condition for future action). Validated by: (a) ✓ `.planning/dep-triage.md` Section 1 has 29 rows (one per Dependabot alert) with closed-set Verdict enum + Rationale taxonomy; (b) ✓ blocker count dropped — 7 GHSAs closed via 4 surgical override edits in commit `d8e3176c` (lodash 4.17.23→4.18.1, minimatch 5.1.0→5.1.9, +ws `$ws` self-ref → 8.21.0, REMOVE follow-redirects pin); 22 non-blocker alerts left to age out by design per operator Option C (19 deferred-stale + 3 deferred-dev-only); (c) ✓ `chai-http` v4 lock + other AGENTS.md locks respected — no override touched chai-http, superagent, chai, or any locked package; (d) ✓ `npm audit` post-fix output captured: runtime-tree high count 9 → 0 (PRIMARY METRIC); full-tree counts in `04-AUDIT-POST.json` (8 = 1H + 7M devDep-only residue stripped by Dockerfile L86). Merge-up to default branches: parent PRs https://github.com/suculent/thinx-device-api/pull/539 (master, merge commit `465b73c2`) + https://github.com/suculent/thinx-device-api/pull/540 (main, merge commit `c0530571`) merged 2026-05-26T23:09Z. Fixes: override edits in `d8e3176c`. Documentation in `0c8cbfb3` + `740f0bff` (Slice 1), `e75fd810` (Slice 2 fix-log), Slice 3 close-out.

- [x] **SEC-PII-01** ✓ Verified 2026-05-26 (Phase 2 — see `phases/02-pii-logging-scrub/02-SUMMARY.md`): `lib/thinx/owner.js` no longer emits raw PII or credential material at any of the 12 (originally 6, surfaced 6 more during execution) sites: emails redacted via `Util.redactEmail` (`m***@domain` pattern); reset_keys/activation tokens redacted via `Util.redactToken` (first-6 + U+2026 ellipsis); Mailgun `err` scoped to `err.message` + `err.statusCode` only. Test-env passthrough at L165-167 preserves the callback's raw value (only the log line is redacted) so the chai-http round-trip spec at `ZZ-AppSessionUserSpec.js:191-198` continues to work. Validated by: (a) ✓ 5 static grep gates PASS (zero raw-value emissions); (b) ✓ `spec/jasmine/UtilSpec.js` 8 new `it()` blocks cover the helpers; (c) ✓ `spec/jasmine/ZZ-OwnerLogRedactionSpec.js` 4 it-blocks exercise error path + success path + audit log + Mailgun source-shape gate; (d) ✓ CI green on `daccf732` (3 builds); (e) ✓ live container code on rtm image `3a461b3d` confirmed to wrap all 12 sites with the redactors. Fixes: helpers `0de30806` + sweep `0314c9a0` + spec `daccf732`.

## v2 Requirements

<!-- Deferred from v1 GA. Tracked here for v1.x and beyond, not in current roadmap. -->

### Backend Hygiene

- **REFACTOR-01**: Resolve duplicate `app.set('trust proxy', ...)` calls at `thinx-core.js:285` and `:407` (second wins; intent unclear) — defer to v1.x because changing trust-proxy behavior mid-release risks session/IP-derivation regressions.
- **REFACTOR-02**: Replace weak equality `!=` with strict `!==` at `lib/thinx/owner.js:476` in `password_reset` — defer to v1.x; behavior is correct in the legacy path but the comparison is fragile.
- **REFACTOR-03**: Add `socket.on('close')` cleanup handlers in `thinx-core.js:445-487` (WebSocket lifecycle) — defer to v1.x; current behavior depends on GC, not crashing prod but a known leak class.
- **REFACTOR-04**: Convert `lib/thinx/owner.js` callback-style chains (73 callback patterns) to async/await — defer to v1.x; cosmetic, no functional gap.
- **REFACTOR-05**: jshint + fs-finder runtime-deps misclassification. `package.json` L55 (`fs-finder: github:suculent/Node-FsFinder#master`) and L59 (`jshint: ^2.13.4`) are declared in `dependencies` but are only used as build/lint tools — they belong in `devDependencies` and should be excluded from the production image (Dockerfile L86 `npm install --omit=dev`). Surfaced during Phase 4 dependency triage 2026-05-26: their nested deps (lodash, minimatch) carried 3 of the 4 Phase 4 blocker fixes; had they been correctly classified, the verdict would have been `deferred-dev-only` and the override edits would have been narrower in scope. Defer to v1.x — restructuring changes production image contents and risks breaking other code paths that may depend on jshint/fs-finder being present. Trigger to revisit: v1.x cycle starts; or another security advisory lands against jshint's or fs-finder's nested deps where the dev-only verdict would save bump cost.

### Security (Posture)

- **SEC-COOKIE-01**: Session cookie at `thinx-core.js:303` currently sets `httpOnly: false` ("temporarily disabled for websocket debugging" per stale comment). Re-evaluate whether `httpOnly: true` is feasible with the current WebSocket flow — defer to v1.x; flipping this without a WebSocket regression test is risky.
- **SEC-WS-01**: WebSocket handshake risk on `rtm.thinx.cloud` (AGENTS.md L96-97: "Websocket handshake may still return 404 even with corrected frontend bundle") — defer to v1.x unless v1 UAT surfaces a regression.
- **SEC-DEP-02**: services/console dependency triage. The console submodule (`services/console`) has 15 open Dependabot alerts of its own (2 high + 13 medium per Phase 4 Slice 4 init context 2026-05-26). SEC-DEP-01 was scoped to `suculent/thinx-device-api` ONLY; the console is a sibling GSD project (`services/console/.planning/`) with its own roadmap (10 phases shipped — v1.0 frontend; Phase 11 in flight). Defer to v1.x — cross-project scope; coordinate with the console project's GSD owner. Trigger to revisit: schedule a parallel SEC-DEP-02 phase in `services/console/.planning/ROADMAP.md` as part of the console's v1.x backlog. The 2 high-severity console alerts may need acceleration if they're in a runtime code path (the parent project does not have visibility into the console's runtime exposure from here).

### Audit Log Retention (surfaced 2026-05-26 in Phase 2 verification)

- **SEC-PII-02**: Historic entries in the CouchDB `managed_logs` database (`thinx_couchdb` on swarm host `188.166.23.244`, ~658,808 docs as of 2026-05-26) still contain raw 64-character reset_keys from before Phase 2's fix landed. Sample evidence: lines like `Attempt to set password with: 53d97b305c88081c744e764ddc7c52dc7b98b74cd503c0f96ae799624014b644`. Phase 2's `SEC-PII-01` fix prevents the leak from continuing; cleanup of the historic data is a separate concern. Defer to v1.x/v2. Possible remediation: (a) one-time `_bulk_docs` UPDATE with redacted message strings, (b) bulk delete of audit entries older than a retention window, (c) introduce an `audit_log` TTL going forward. GDPR-adjacent.

### Operations (surfaced 2026-05-26 in Phase 3 verification)

- **OPS-02**: Stale swarm membership entry `b356ad8e1d60` / `10.133.0.4` remains in dockerd's memberlist gossip layer, causing Push/Pull timeouts (10+ events 2026-05-25 15:25-15:57 UTC). Not in `docker node ls`. Rung 1's success in Phase 3 made cleanup deferrable — the silent watcher was unrelated to fabric churn. Cleanup procedure is the Rung 3 protocol in `phases/03-swarm-auto-pull/03-PLAN.md` Task 5 (currently checkpoint-gated and inactive). Defer to v1.x: (a) not causal to OPS-01; (b) cleanup carries swarm-fabric risk, best done on a low-traffic window; (c) the timeouts are tolerable noise, not service-affecting. Trigger to re-evaluate: if memberlist timeouts re-correlate with another swarmpit_app silence event, OR if a new node joins the cluster and gossip churn elevates.
- **OPS-03**: Pre-existing autoredeploy-failed services with malformed image-tag specs (trailing `@` with no digest) — surfaced in watcher logs 2026-05-26 16:23-16:24 UTC. Affected services: `thinx_chronograf` (`chronograf:1.9@`), `thinx_couchdb` (`couchdb:3@`), `thinx_influxdb` (`influxdb:1.8@`), `thinx_worker` (`thinxcloud/worker:latest@`). Each fails autoredeploy with HTTP 400 `InvalidArgument: ContainerSpec: "<tag>@" is not a valid repository/tag`. Unrelated to OPS-01 (running tasks unaffected; only autoredeploy is broken on these specific services). NOT v1 GA-blocking. Worth fixing as v1.x hygiene — particularly `thinx_couchdb` because broken autoredeploy means manual `./restart.sh` is the only path to bump CouchDB. Investigate before any future CouchDB version bump. Cleanup: edit `/mnt/gluster/deployment/swarm/*.yml` to remove the trailing `@` from each image spec (or pin to a real digest), then `docker stack deploy`.

### Auth & Account Lifecycle (surfaced 2026-05-26 in Phase 1 UAT)

- **AUTH-REACTIVATE-01**: No user-facing flow to reactivate an account that was soft-deleted (`user.deleted = true` via `Owner.delete()` at `lib/thinx/owner.js:660-682`). Once `deleted:true` is set, the user is locked out by `lib/router.auth.js:189-191` and the only recovery is direct CouchDB mutation (a session admin had to do this manually 2026-05-26 to unblock the Phase 1 UAT). Options: (a) admin-only reactivation endpoint, (b) self-serve via a separate "restore my account" email link, (c) revert the GDPR delete-after-N-days semantics so soft-delete auto-purges on schedule and there's never a "stuck deleted:true" state. Defer triage to v1.x; not a regression, just a missing recovery path.
- **AUTH-RESET-LINK-CONSOLE**: Password-reset email link from `lib/thinx/owner.js:147` uses `app_config.api_url` (rtm.thinx.cloud), so users land on the LEGACY AngularJS console's password-set page, not the Vue console. Fix: either (a) introduce `app_config.console_url` for the email link, OR (b) make the GET handler on the API redirect to the Vue console after reset_key validation. Defer to v1.x; needs coordination with the console submodule's password-set route.

### Frontend (legacy console — services/console/src/, deprecation path)

- **CONSOLE-LEGACY-JSON-PARSE**: Legacy AngularJS console at `services/console/src/` shows `SyntaxError: JSON Parse error: Unexpected identifier "object"` on the success branches of `login.js:173` and `password.js:87` — `JSON.parse(...)` being called on a value that's already a JS object (coerces to `"[object Object]"` and fails). Long-standing bug surfaced during Phase 1 UAT 2026-05-26. Lives in the legacy AngularJS console codebase, NOT the Vue console. Low priority because legacy console is being deprecated for v1 GA in favor of Vue.

### Testing

- **TEST-CHAI-01**: Migrate `spec/jasmine/ZZ-*` (16 spec files, ~200 `chai.request(thx.app)` calls) from chai-http v4 to v5 ESM API — deferred per `AGENTS.md:82-92` until a Snyk/Dependabot CVE in `superagent` v3 forces the upgrade.

## Out of Scope

Explicitly excluded from v1 GA. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| `services/console` frontend work | Owned by the console submodule's GSD project (`services/console/.planning/`) |
| G10 (`thinx_worker` silent-loop on docker pull) | Lives in the worker repo — different codebase |
| chai-http v5 migration | Explicit dependency lock per `AGENTS.md:82-92`; tracked as TEST-CHAI-01 deferred |
| Multi-tenant revamp / v2 API features | Future milestone, not v1 GA |
| Edge layer redesign (Traefik labels, nginx rewrites beyond G8 needs) | Only AUTH-API-01 may touch edge config; otherwise outside scope |
| Dashboard data-exposure rework (AGENTS.md L98) | Privacy concern but not a regression vs. legacy — v1.x candidate |

## Traceability

<!-- Filled by the roadmapper at initialization (2026-05-26). -->

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-API-01 | Phase 1 | **Verified (2026-05-26)** |
| SEC-PII-01 | Phase 2 | **Verified (2026-05-26)** |
| OPS-01 | Phase 3 | **Verified (2026-05-26)** |
| SEC-DEP-01 | Phase 4 | **Verified (2026-05-27)** |

**Coverage:**
- v1 requirements: 4 total
- Mapped to phases: 4 ✓
- Verified: 4 (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01)
- Pending: 0
- Unmapped: 0

---
*Requirements defined: 2026-05-26*
*Last updated: 2026-05-27 — SEC-DEP-01 verified via Phase 4 Slice 4 merge-up to default branches (PR #539 thinx-staging→master merged 2026-05-26T23:09:34Z, mergeCommit `465b73c2`; PR #540 thinx-staging→main merged 2026-05-26T23:09:55Z, mergeCommit `c0530571`). v1 GA backend closures complete: 4/4 v1 requirements Verified. services/console merge-up deferred to separate cross-project coordination effort (SEC-DEP-02 v1.x backlog).*
