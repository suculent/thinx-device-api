---
phase: 04-dependency-triage
plan: 02
subsystem: security
tags: [dependency-overrides, npm-audit, dependabot, ws, lodash, minimatch, follow-redirects, sec-dep-01]

# Dependency graph
requires:
  - phase: 04-01-baseline-and-triage-table
    provides: "7 blocker GHSA IDs + 4 surgical override-block edits identified in dep-triage.md Section 1"
  - phase: 03-swarm-auto-pull
    provides: "Operational Swarmpit autoredeploy path on rtm.thinx.cloud — verified end-to-end by this slice (delta=49s)"
  - phase: 02-pii-logging-scrub
    provides: "PII redaction on password_reset_init log path — verified inline by this slice (x***@y emission shape)"
  - phase: 01-auth-api-password-reset
    provides: "Bearer-null guard contract on rtm — verified inline post-deploy"
provides:
  - "package.json overrides block with 4 surgical edits committed atomically (commit d8e3176c)"
  - "Regenerated package-lock.json (-75/+12 net) with all transitive ws/lodash/minimatch/follow-redirects resolved to safe versions"
  - "Provisional post-fix npm audit artifacts (04-AUDIT-POST-PROVISIONAL.json + 04-AUDIT-POST-PROD-PROVISIONAL.json)"
  - "Fix log row in .planning/dep-triage.md Section 2 (commit e75fd810)"
  - "Live-deployed new image sha256:4d3fb789c915b6dbed268f6e55ddbb8214255e1bfcd9614eb7ca53925059bd01 on rtm.thinx.cloud"
affects: [04-03-post-fix-baseline-and-closeout, 04-04-merge-up-to-default-branches]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "npm override self-reference (`\"ws\": \"$ws\"`) — canonical pattern for forcing transitive packages to match the top-level direct-dep version when EOVERRIDE rejects a literal pin"
    - "CI as the regression gate when local test env lacks production secrets — established session-wide (Phases 1, 2, 3 also followed this pattern); operator decision 2026-05-27 makes it explicit for Phase 4"
    - "Atomic 2-file commit (package.json + package-lock.json) is the load-bearing change-shape for dependency-fix commits; no source code modified; submodule pointer deltas explicitly excluded"

key-files:
  created:
    - .planning/phases/04-dependency-triage/04-AUDIT-POST-PROVISIONAL.json
    - .planning/phases/04-dependency-triage/04-AUDIT-POST-PROD-PROVISIONAL.json
    - .planning/phases/04-dependency-triage/04-02-SUMMARY.md
  modified:
    - package.json
    - package-lock.json
    - .planning/dep-triage.md

key-decisions:
  - "ws override uses self-reference \"$ws\" (resolves to 8.21.0) instead of plan's bare literal \"8.20.1\"; npm EOVERRIDE rejected the bare form because ws is also a direct dependency. RESEARCH.md L484 explicitly anticipates 8.21.0 as safe. Security goal (>= 8.20.0 patched-line start, > 8.20.1 plan target) preserved at all 6 ws instances."
  - "Local `npm test` skipped per operator decision 2026-05-27 (Option A: CircleCI as the regression gate). Project specs require CI-only secrets (/mnt/data/conf/config.json, real mailgun.js@12.1.1 key, REDIS_PASSWORD, SSL CA bundle) that the dev host does not carry. Phases 1–3 were validated this way."
  - "Submodule pointer change on services/console NOT included in the atomic dependency commit — pre-existing pointer drift, owned by services/console's own GSD project."

patterns-established:
  - "RESEARCH.md should pre-flag override-syntax ambiguities when a target package is both a direct dep and a transitive (the `\"$pkg\"` self-reference pattern). Slice 1's research caught the ws@8.20.1 vs 8.21.0 ambiguity (L484) but did not flag the EOVERRIDE that mandates self-reference syntax."
  - "CI-as-regression-gate authorization should be a phase-level config bit set at plan-time, not a mid-execution checkpoint, when a project's spec suite requires production secrets unavailable on developer hosts."

requirements-completed: []  # SEC-DEP-01 is partially satisfied (blocker fix shipped); Slice 3 closes it with post-deploy Dependabot rescan + formal post-fix baseline.

# Metrics
duration: 8m
completed: 2026-05-27
---

# Phase 4 Plan 02: Blocker Fixes Summary

**4 surgical package.json overrides shipped atomically (commit d8e3176c), CI green on first try (3/3 CircleCI jobs PASS), Swarmpit autoredeploy fired automatically in 49s, runtime-tree npm audit high count dropped 9 → 0 on rtm.thinx.cloud — Phase 1 (Bearer-null → 200) + Phase 2 (PII redaction) contracts both verified intact post-deploy.**

## Performance

- **Duration:** 8m (Task 4 commit at 22:30:51Z setup-to-Task6 push at 22:38:54Z)
- **Started:** 2026-05-27T00:30:51+02:00 (= 2026-05-26T22:30:51Z) — pre-commit verification began
- **Completed:** 2026-05-27T00:38:54+02:00 (= 2026-05-26T22:38:54Z) — Task 6 push completed
- **Tasks:** 3 of 6 executed by this continuation agent (Tasks 4, 5, 6). Tasks 1+2 done by predecessor; Task 3 (local `npm test`) skipped per operator decision. All 6 tasks resolved.
- **Files modified:** 3 (package.json, package-lock.json, .planning/dep-triage.md) + 2 created (provisional audit JSONs, untracked).

## Deploy timeline (Task 5 observations)

| Marker                          | Timestamp (UTC)              | Source                                                |
|---------------------------------|------------------------------|-------------------------------------------------------|
| t0 — git push to thinx-staging  | 2026-05-26T22:31:14Z         | local clock                                           |
| Pipeline 5230 created           | 2026-05-26T22:31:18Z         | CircleCI v2 API                                       |
| `test` job (#13852)             | 22:31:44Z → 22:33:40Z PASS   | CircleCI v1.1 — 1m 56s — this is the regression gate  |
| `build-api-cloud` (#13853)      | 22:34:21Z → 22:35:07Z PASS   | CircleCI v1.1 — image build + docker push             |
| Image publish to docker hub     | 2026-05-26T22:35:05.290Z     | hub.docker.com tags/latest last_pushed                |
| Swarmpit watcher decision       | 2026-05-26T22:35:42.369Z     | `INFO: thinx_api autoredeploy fired! DIGEST: e599→4d3f` (37s after publish) |
| New `thinx_api.1` task Running  | 2026-05-26T22:35:54Z         | docker ps CreatedAt on micro node — image sha256:4d3fb789 |
| `build-vue-console` (#13851)    | 22:32:04Z → 22:36:53Z PASS   | CircleCI v1.1 — long pole; gates overall workflow `main=success` |
| Phase 1 contract probe         | 2026-05-26T22:37:46Z         | `POST /api/v2/password/reset` w/ `Bearer null` → 200 `password_reset_request_accepted` |
| **Push → CI workflow green**    | **5m 39s**                   | t0 → 22:36:53Z workflow stopped_at                    |
| **Image publish → task Running**| **49s**                      | 22:35:05.290Z → 22:35:54Z (Phase 3 baseline 63s; SLA ≤120s; **14s under Phase 3 baseline**) |
| **Watcher decision → task Running** | **12s**                  | 22:35:42Z → 22:35:54Z                                 |

**Rung 1 recovery needed?** No — Phase 3's fix held; autoredeploy fired automatically on first publish.

## New image digest

`sha256:4d3fb789c915b6dbed268f6e55ddbb8214255e1bfcd9614eb7ca53925059bd01` (`thinxcloud/api:latest`, last_pushed 22:35:05.290Z).

Replaces the prior Phase 3 image `sha256:e599efa5f58864ec5f9b44de8704c7a20f61bc0983c0d45bbb4f12d2b6094574` (the no-op SLA-test marker image from 5 hours earlier).

## Provisional npm audit counts (Task 2 captured, Task 5 verified still hold post-install)

| Metric                                  | Pre-fix (Slice 1 baseline) | Post-fix (this slice provisional) |
|-----------------------------------------|----------------------------|-----------------------------------|
| `npm audit` full tree — total           | 34 (23H + 11M + 0L)        | 8 (1H + 7M + 0L) — **devDep-only residue**, stripped by Dockerfile L86 `npm install --omit=dev` |
| `npm audit --omit=dev` runtime tree — total | 15 (9H + 6M + 0L)      | **0 (0H + 0M + 0L)** ← Phase 4 primary success metric |

Re-run `npm audit --omit=dev --json` at Task 4 pre-commit verification reproduced post-fix `{ high: 0, moderate: 0, low: 0, total: 0 }` — identical to Task 2's provisional file.

## Resolved versions (verified via `npm ls` post-install)

| Package         | Pre-fix         | Plan target | Actual resolution            | Notes |
|-----------------|-----------------|-------------|------------------------------|-------|
| follow-redirects | 1.15.6 (override) | (removed)  | **1.16.0** (single instance) | axios@1.16.1's own `^1.16.0` declaration resolves naturally — past GHSA-r4q5-vmmm-2653 patched range. |
| lodash          | 4.17.23 (override) | 4.18.1    | **4.18.1** (all 6 instances) | Closes GHSA-r5fr-rjxr-66jc + GHSA-f23m-r3pf-42rh. |
| minimatch       | 5.1.0 (override)   | 5.1.9     | **5.1.9** (all 9 instances)  | Closes GHSA-7r86-cg39-jmmj + GHSA-23c5-xmqv-rm74 + GHSA-3ppc-4f35-3m26. |
| ws              | 8.17.1 nested + 8.20.1 top | 8.20.1 | **8.21.0** (all 6 instances) | See Deviation A. ws@8.21.0 > 8.20.1 plan target > 8.20.0 patched-line start. GHSA-58qx-3vcg-4xpx closed. RESEARCH.md L484 explicitly anticipates this version. |

## Task Commits

| Task | Name                                                         | Commit       | Type    | Files                                                                                       |
|------|--------------------------------------------------------------|--------------|---------|---------------------------------------------------------------------------------------------|
| 1    | Apply 4 surgical override edits to package.json              | (uncommitted by predecessor; included in Task 4 atomic commit per plan) | — | package.json                                                                                |
| 2    | Regenerate package-lock.json; capture provisional audit JSONs | (uncommitted by predecessor; provisional JSONs intentionally untracked for Slice 3) | — | package-lock.json (in Task 4); provisional audit JSONs untracked |
| 3    | Local `npm test` regression gate                             | **SKIPPED**  | n/a     | Operator decision 2026-05-27: CircleCI is the regression gate. See Deviation B.            |
| 4    | Atomic commit of package.json + package-lock.json            | `d8e3176c`   | chore   | package.json, package-lock.json                                                             |
| 5    | Push + CI watch + Swarmpit autoredeploy + contract probes    | (no commit — observation/verification task) | — | — |
| 6    | Append fix-log row to .planning/dep-triage.md Section 2      | `e75fd810`   | docs    | .planning/dep-triage.md                                                                     |

**Plan metadata commit:** (this SUMMARY.md commit follows below; STATE/ROADMAP/REQUIREMENTS bookkeeping handled by the orchestrator post-slice per the sequential_execution prompt directive).

## Files Created/Modified

### Modified (in version control)
- `package.json` — 4 override-block edits: -follow-redirects; lodash 4.17.23 → 4.18.1; minimatch 5.1.0 → 5.1.9; +ws: "$ws"
- `package-lock.json` — regenerated by single `npm install`; -75 lines / +12 lines net (removed nested ws@8.17.1 instances, upgraded lodash + minimatch resolutions, upgraded follow-redirects resolution)
- `.planning/dep-triage.md` — 1 new data row appended to Section 2 (Fix log). Sections 1 (Triage table), 3 (Post-fix baseline), 4 (Rationale taxonomy), 5 (Verdict enum) byte-identical to Slice 1's commit.

### Created (untracked — for Slice 3 to commit alongside the post-deploy formal baselines)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROVISIONAL.json` — full-tree npm audit JSON (8 = 1H + 7M devDep-only)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROD-PROVISIONAL.json` — runtime-tree npm audit JSON (0 = primary metric ✓)
- `.planning/phases/04-dependency-triage/04-02-SUMMARY.md` — this file

### Not modified (explicitly out of scope this slice)
- `services/console` (submodule pointer drift pre-dates this slice; owned by services/console GSD project; explicitly excluded from staging)
- All `lib/`, `thinx-core.js`, `thinx.js`, `spec/` — zero source-code touches.

## Decisions Made

- **Use `"ws": "$ws"` self-reference** rather than plan's bare `"ws": "8.20.1"`. The bare form triggers npm EOVERRIDE because ws is also a direct dep at package.json L94. Self-reference is the canonical npm pattern for this situation; it forces all 6 ws instances (top-level + 5 transitive paths through socket.io / engine.io / engine.io-client / socket.io-adapter / nano) to resolve to whatever the top-level `^8.20.1` resolves to (currently 8.21.0). RESEARCH.md L484 anticipated this version as safe.
- **CircleCI as the regression gate** (per operator decision 2026-05-27, Option A). Skipped local `npm test`. Project specs require CI-only secrets (`/mnt/data/conf/config.json`, real mailgun.js@12.1.1 key, REDIS_PASSWORD, SSL CA bundle) unavailable on this dev host. Phases 1, 2, 3 were also validated this way. CircleCI build #13852 (`test` job) PASS @ 22:33:40Z is the regression evidence-of-record.
- **Excluded `services/console` submodule pointer change from the atomic commit.** Pre-existing drift; owned by a separate GSD project.
- **Did not push between Tasks 4 and 5.** Plan specifies pushing on Task 5; Task 4 is local commit only. Followed as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue, research-anticipated] npm override syntax: ws must use self-reference**
- **Found during:** Task 1 (`npm install` after applying the 4 surgical edits) — by predecessor agent.
- **Issue:** Plan called for `"ws": "8.20.1"` as a bare-value override. npm install rejected it with `EOVERRIDE: Override for ws@^8.20.1 conflicts with direct dependency` because `ws` is also a direct dep in package.json L94 (`"ws": "^8.20.1"`).
- **Fix:** Used the canonical npm self-reference pattern `"ws": "$ws"`. All 6 nested ws instances now resolve to ws@8.21.0 (the latest in the top-level `^8.20.1` range). 8.21.0 > 8.20.1 (plan target) > 8.20.0 (GHSA-58qx-3vcg-4xpx patched-line start). Security fix is preserved at all 6 instances.
- **Files modified:** `package.json` (`overrides.ws = "$ws"`)
- **Verification:** `npm ls ws` shows `ws@8.21.0` at all 6 locations (top-level + engine.io + engine.io-client + socket.io-adapter + 2 dedupes). No ws@8.17.1 anywhere. RESEARCH.md L484 explicitly anticipates 8.21.0: *"Latest is 8.21.0; init context pins to 8.20.1. Either is safe (both > 8.20.0 patched line)."*
- **Committed in:** `d8e3176c` (Task 4 atomic commit — predecessor's uncommitted Task 1 edit folded in).

**2. [Rule 3 — Blocking environmental issue, operator-approved] Local `npm test` regression gate skipped**
- **Found during:** Task 3 evaluation — the predecessor returned a `checkpoint:decision` for the operator.
- **Issue:** The project's spec suite (17 ZZ-* mocha + non-ZZ jasmine specs) is designed to run in CircleCI and requires CI-only environmental fixtures that this dev host does not carry: `/mnt/data/conf/config.json` (CouchDB + Redis + mailgun + slack creds), the real `mailgun.js@12.1.1` API key, `REDIS_PASSWORD`, and the SSL CA bundle paths that CI mounts. Running `npm test` locally would either fail on missing config (false-negative regression signal) or attempt to dial production services from a developer machine (operationally unacceptable).
- **Fix:** Skipped Task 3. Treated CircleCI build #13852 (`test` job, 22:31:44Z → 22:33:40Z, **PASS**) as the regression evidence-of-record. This matches the validation pattern of Phases 1, 2, and 3 per their SUMMARYs.
- **Operator authorization:** Explicit decision 2026-05-27 — *"proceed without local test"* (Option A: Treat CircleCI as the regression gate).
- **Files modified:** None.
- **Verification:** CircleCI workflow `main` for pipeline 5230 (commit `d8e3176c`) finished `status=success`; all 3 jobs (test + build-api-cloud + build-vue-console) PASS. Post-deploy contract probes also pass (Phase 1 Bearer-null → 200; Phase 2 PII redaction `x***@y` in log emission).
- **Committed in:** Documented in `d8e3176c` commit body + this SUMMARY; no code commit needed.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — Blocking issue).
**Impact on plan:** Neither deviation altered the security outcome. Deviation A (ws self-ref) preserves the security fix at a higher version than the plan's target (8.21.0 vs 8.20.1, both past the patched line); the change is purely syntactic. Deviation B (local `npm test` skip) is an environmental constraint pre-existing the plan; operator-approved; CI provides equivalent or stronger regression coverage. No scope creep; no new packages added; the change-shape (4 override edits, 2 files committed atomically) is exactly as planned.

## Issues Encountered

None during this continuation. The predecessor's halt at Task 3 was correct (decision required, not a bug). Post-decision execution was clean: commit → push → CI green first try → Swarmpit autoredeploy first try → contract probes pass first try.

## Threat Flags

None. This slice ONLY tightens existing pins in `package.json` overrides; it adds zero new packages and modifies zero source files. The 4 affected packages (follow-redirects, lodash, minimatch, ws) are all in the npm registry's top-tier by download count, with established maintainer history (per RESEARCH.md Package Legitimacy Audit section). No new network endpoints, auth paths, file-access patterns, or schema changes introduced.

## Self-Check: PASSED

Verified post-write that all claimed files exist and all claimed commits are reachable.

- File `.planning/phases/04-dependency-triage/04-02-SUMMARY.md` — present (this file)
- File `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROVISIONAL.json` — present (untracked, intentional)
- File `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROD-PROVISIONAL.json` — present (untracked, intentional)
- File `package.json` — modified, in-tree
- File `package-lock.json` — modified, in-tree
- File `.planning/dep-triage.md` — modified, in-tree (Section 2 has new fix-log row)
- Commit `d8e3176c` (Task 4: chore(deps) SEC-DEP-01 - resolve 7 active alerts via overrides) — reachable from HEAD~1
- Commit `e75fd810` (Task 6: docs(deps) SEC-DEP-01 - fix log row for Slice 2 commit d8e3176c) — reachable from HEAD
- Both commits pushed to `origin/thinx-staging` (verified by push output `0e1e0ab2..d8e3176c` and `d8e3176c..e75fd810`)
- CircleCI pipeline 5230 workflow `main` status=success (build_nums 13851, 13852, 13853 all outcome=success)
- New rtm image `sha256:4d3fb789...` running on `thinx_api.1@micro` since 22:35:54Z
- Phase 1 contract probe HTTP 200 with body `password_reset_request_accepted` @ 22:37:46Z
- Phase 2 PII redaction emission `x***@y` confirmed in container logs @ 22:37:46Z

## Next Plan Readiness

Slice 3 (04-03-post-fix-baseline-and-closeout) can now:

1. **Capture the formal post-fix baseline** by re-running `npm audit` + re-querying `gh api repos/suculent/thinx-device-api/dependabot/alerts?state=open` after Dependabot rescans the new lockfile (typical lag: 1–24h after merge to default branch). The provisional artifacts left at `.planning/phases/04-dependency-triage/04-AUDIT-POST-{PROD-}PROVISIONAL.json` give Slice 3 a deterministic comparison target for the lockfile-only diff; the Dependabot snapshot will differ (alert close events will land).
2. **Compute pre/post deltas** for the close-out:
   - Runtime-tree: 15 → 0 (= **-15 total, -9H, -6M**)
   - Full tree: 34 → 8 (= **-26 total, -22H, -4M**; remaining 1H + 7M are all devDep-only, stripped by Dockerfile L86)
3. **Append Section 3 (Post-fix baseline) to `.planning/dep-triage.md`** with the formalized counts, deltas, and Dependabot-state cross-check.
4. **Mark SEC-DEP-01 complete** in REQUIREMENTS.md once Section 3 is populated.
5. **Slice 4 (04-04-merge-up)** then handles the merge-up from `thinx-staging` to `master`, after which Dependabot's default-branch alert count (currently 29 against master) will drop by the 7 alerts closed by this slice. The push-warning at the bottom of `git push` will start reflecting the new lower count.

No blockers. The deploy pipeline (CI + Swarmpit autoredeploy) is exercised end-to-end on the new image; Phase 3's fix is load-bearing-and-confirmed (49s deploy delta, beating the 63s Phase 3 baseline by 14s).

---
*Phase: 04-dependency-triage*
*Slice: 02-blocker-fixes*
*Completed: 2026-05-27*
