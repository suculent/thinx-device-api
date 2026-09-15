---
phase: 21-csp-wildcard-removal-anti-csrf-token
plan: 03
subsystem: infra
tags: [csp, nginx, security-headers, console, crisp, google-fonts, google-analytics, rollbar]

# Dependency graph
requires:
  - phase: 21-csp-wildcard-removal-anti-csrf-token
    provides: 21-CONTEXT.md locked CSP host-pinning decision (D-06) and the two-console/three-source wiring map
provides:
  - Pinned CSP default-src/connect-src host allowlist (no https:/wss: scheme wildcard) applied identically across services/console/src/default.conf, services/console/vue/default.conf, and the rtm.thinx.cloud-server pre/post nginx runbook snapshots
affects: [21-04-console-submodule-pointer-bump, hawkscan-rescan-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSP host pinning applied identically across N config sources using each source's own existing placeholder token (__WEB_HOSTNAME__ / __NGINX_HOST__), verified via placeholder-normalized diff rather than literal byte comparison"

key-files:
  created: []
  modified:
    - services/console/src/default.conf (submodule)
    - services/console/vue/default.conf (submodule)
    - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx
    - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx

key-decisions:
  - "Re-verified the host enumeration grep before editing (crisp/fonts/google-analytics/rollbar) — confirmed no drift since planning; the 7-host pinned list (rtm.thinx.cloud, console.thinx.cloud, *.crisp.chat, fonts.googleapis.com, fonts.gstatic.com, www.google-analytics.com, api.rollbar.com) matches the plan exactly"
  - "Preserved each source's pre-existing unsafe-inline/unsafe-eval token set unchanged (neither console default.conf had unsafe-eval; the runbook snapshot pair kept its unsafe-eval) — SEC-CSP-02 stays deferred"
  - "Submodule commit pushed to origin thinx-staging immediately (not deferred to 21-04, which only bumps the parent's submodule pointer)"

requirements-completed: [SEC-CSP-01]

duration: ~3min
completed: 2026-07-05
---

# Phase 21 Plan 03: CSP Wildcard Removal Summary

**Removed the `https:`/`wss:` CSP scheme wildcard from all three CSP sources (both console nginx images + the swarm-edge runbook snapshot pair), replacing it with an explicit 7-host allowlist (rtm.thinx.cloud, console.thinx.cloud, `*.crisp.chat`, fonts.googleapis.com, fonts.gstatic.com, www.google-analytics.com, api.rollbar.com) applied byte-identically modulo each source's own placeholder token.**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-07-05T19:05:35Z
- **Tasks:** 2
- **Files modified:** 4 (2 in submodule, 2 in parent repo)

## Accomplishments
- Re-ran the host-enumeration grep across `services/console/src` and `services/console/vue` and confirmed the plan's host table still matches the live codebase — no drift since planning.
- Pinned the exact same `default-src`/`connect-src` host list into `services/console/src/default.conf` and `services/console/vue/default.conf`, committed and pushed to the `services/console` submodule's `origin/thinx-staging`.
- Applied the identical pinned list (plus the runbook pair's pre-existing `'unsafe-eval'`) to both `rtm.thinx.cloud-server.pre.nginx` and `.post.nginx` snapshots, with an explanatory comment clarifying the console image redeploy is the actual deploy mechanism for this line.
- Verified all four CSP strings are byte-identical modulo the placeholder token (`__WEB_HOSTNAME__` / `__NGINX_HOST__`) and modulo the runbook pair's extra `'unsafe-eval'` token.

## Final Pinned CSP (host-list portion, placeholder-normalized)

```
default-src 'self' <PLACEHOLDER> https://rtm.thinx.cloud https://console.thinx.cloud https://*.crisp.chat https://fonts.googleapis.com https://fonts.gstatic.com https://www.google-analytics.com https://api.rollbar.com data: blob: 'unsafe-inline'; connect-src 'self' <PLACEHOLDER> https://rtm.thinx.cloud https://console.thinx.cloud https://*.crisp.chat wss://client.relay.crisp.chat https://www.google-analytics.com https://api.rollbar.com; frame-ancestors 'self'; form-action 'self' <PLACEHOLDER> https://github.com; object-src 'none'; base-uri 'self'
```

- `services/console/src/default.conf`: `<PLACEHOLDER>` = `__WEB_HOSTNAME__`, no `'unsafe-eval'` (unchanged from before).
- `services/console/vue/default.conf`: `<PLACEHOLDER>` = `__NGINX_HOST__`, no `'unsafe-eval'` (unchanged from before).
- Runbook pre/post snapshots: `<PLACEHOLDER>` = `__NGINX_HOST__` (newly introduced), plus trailing `'unsafe-eval'` after `'unsafe-inline'` (pre-existing, preserved).

## Task Commits

**Repo: `services/console` (submodule, branch `thinx-staging`)**
1. **Task 1: Pin CSP host allowlist in both console default.conf files** - `d41d4ba` (fix) — pushed to `origin/thinx-staging`

**Repo: `thinx-device-api` (parent)**
2. **Task 2: Pin CSP host allowlist in rtm.thinx.cloud-server runbook snapshots** - `762d16e0` (fix)

**Plan metadata:** committed separately after this summary (see final commit).

## Files Created/Modified

Submodule (`services/console`, commit `d41d4ba`, pushed):
- `src/default.conf` - Legacy console CSP `add_header` line (line 21) updated to the pinned host list
- `vue/default.conf` - Vue console CSP `add_header` line (line 22) updated to the pinned host list

Parent repo (`thinx-device-api`, commit `762d16e0`):
- `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx` - CSP line updated + explanatory comment added
- `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx` - CSP line updated + explanatory comment added (kept byte-identical to `.pre.nginx`)

## Decisions Made
- Followed the plan's exact enumerated host list and connect-src/default-src assignment; no new hosts added or discretionary choices made.
- Left `services/broker`, `services/console` (submodule pointer), and the untracked `nightshift.yaml` in the parent repo's working tree completely untouched — these are unrelated pre-existing changes out of this plan's scope (submodule pointer bump is explicitly 21-04's job per the plan's CROSS-REPO NOTE).

## Deviations from Plan

None - plan executed exactly as written. Both tasks' automated `<verify>` commands were run and passed as specified in the plan.

## Issues Encountered

None. The submodule was already on `thinx-staging` with a clean working tree for the two target files, and `git -C services/console push origin thinx-staging` succeeded (GitHub returned only a routine Dependabot vulnerability notice, not an error).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The submodule commit (`d41d4ba`) is already pushed to `origin/thinx-staging`, ready for CI to build/deploy the console images.
- The parent repo's submodule pointer still references the pre-Phase-21 `services/console` commit — bumping it to `d41d4ba` is 21-04's responsibility, as noted in the plan's CROSS-REPO NOTE.
- Plan 21-04's functional-verify checkpoint (browser DevTools, Crisp widget `wss://client.relay.crisp.chat` connectivity) is the next gate before the HawkScan rescan.

---
*Phase: 21-csp-wildcard-removal-anti-csrf-token*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 5 claimed files exist on disk; both commits (`d41d4ba` in the submodule, `762d16e0` in the parent) are present in their respective repos' history; `origin/thinx-staging` in the submodule confirms `d41d4ba` is at the tip of the pushed remote branch.
