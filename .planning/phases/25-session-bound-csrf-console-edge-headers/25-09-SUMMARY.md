---
phase: 25-session-bound-csrf-console-edge-headers
plan: 09
subsystem: ops
tags: [nginx, csp, headers, parity, ci, production]

requires:
  - phase: 25-08
    provides: CSRF_MODE=signed live
provides:
  - Hardened gluster console config live on both hosts (swarm 9b7b055; rollback 73d97be)
  - Exactly one CSP per response on both console hosts, proxied /api/* included (D-19)
  - Image config mirrors, parity check with one Vue exception, CI step "Console header parity (SEC-CSP-04)"
  - scripts/console-live-headers.sh
affects: [25-10]

requirements-completed: [SEC-CSP-03, SEC-CSP-04]
---

# 25-09 SUMMARY: console edge headers hardened, mirrored and gated

## Task 1

The operator answered `proceed`.

## Task 2: live edit (2026-10-01)

| Step | Result |
|---|---|
| Before-state | `LIVE-HEADERS FAIL 10`: `xpcdp=all` on pages, no Referrer-Policy or Permissions-Policy, `csp=2` on `/api/p25-header-probe` on both hosts |
| Rollback point | swarm `73d97be`. The live file was committed as-is (md5 `f4e9fde7…`), including its uncommitted HSTS and CSP-allowlist edits from earlier phases |
| `nginx -t` | Ran in a throwaway container from the `thinx_vue` image: syntax ok, test successful |
| In-place write | inode unchanged, md5 `cf25f548…`, 5147 bytes |
| Forced restarts | `thinx_console` at 11:07:44Z, `thinx_vue` at 11:07:55Z. Both completed and are Running |
| After-state | `LIVE-HEADERS OK`: 10/10 lines `csp=1 xpcdp=none referrer=1 permissions=1`. `/assets/thinx/csrf.js` (rtm) and `/favicon.ico` (console) each carry 1 CSP |
| Harden commit | swarm `9b7b055`. Checks: `hide=5 proxy_pass=5 loc_add_header=0 csp_lines=1 worktree_diff=0` |
| Snapshots | `.prod` and `post.nginx` refreshed, `pre.nginx` recaptured (its config section is byte-identical to the Phase 21 capture), `CSP-VALUE-UNCHANGED`. Committed as `07055a59` |

## Task 3: mirrors and CI gate

- console `c58dd09`: both image configs carry the canonical header set and `proxy_hide_header` on every proxy location.
- parent `72efe5cd`:
  - adds the CI step "Console header parity (SEC-CSP-04)" after "Fetch all submodules and tests"
  - updates the runbook with the hardened state, the edit procedure, the rollback SHAs and the SEC-CSP-05 note
  - gives the parity check its one exception
- **Deviation, approved by the operator:** the plan mirrored the canonical CSP into the Vue image verbatim, `'unsafe-eval'` included. The Vue image build runs `yarn test:csp:dist`, which asserts `script-src` has no `'unsafe-eval'`, so the build would have failed.
  - The Vue image keeps `'unsafe-eval'` out of `script-src`.
  - `scripts/check-console-headers.js` allows exactly that token, only in `script-src`, only in `services/console/vue/default.conf` (`EVAL_OPTIONAL`). This overrides D-16's "no exception table" for that one token.
  - Two new `node:test` cases cover the exception: it allows nothing else, and the default exception names only the Vue config. 15/15 pass.
- Local checks: `HEADER-PARITY OK files=4`, `files=5` with `--live` against a fresh copy of the gluster file, and the Vue `test:csp` passes.
- CI for `72efe5cd`: test 15511 (with the parity step), api-registry 15512, console-classic-registry 15508, vue-console-registry 15513, and all Snyk monitors passed.
- Rollout by 11:19:18Z: api `ec26de071e7f…`, vue `7c3e5e000d25…`, console `6d2842640608…`.
- A signed pre-session primed before the push answered `email_required` at 11:19:25Z. Headers still `LIVE-HEADERS OK`.

## Follow-ups

- SEC-CSP-05: give `console.thinx.cloud` its own CSP without `'unsafe-eval'`. This needs a per-host gluster file or retiring the bind mount.
- `/nginx_status` is publicly reachable on both hosts.
