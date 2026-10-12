---
phase: quick-261012-fqh
plan: 01
quick_id: 261012-fqh
subsystem: docs / edge runbooks
tags: [traefik, edge, runbook, review-ledger, v1.15, docs-only]
status: complete
requires: []
provides:
  - "EDGE-OPS-03 closed in the fix-forward list (PASS 380 s, 600 s budget)"
  - "Phase 33 resolutions block (rows #2-#5) in the fix-forward list"
  - "Post-rollback reconciliation note in swarm.md"
  - "0 open rows in the 29/30/32/33 review ledgers"
affects:
  - .planning/runbooks/traefik-edge-fixforward.md
  - .planning/runbooks/traefik-edge-hardening.md
  - .planning/runbooks/swarm.md
  - .planning/milestones/v1.15-phases/{29,30,31,32,33}-*/*-REVIEW-DISPOSITION.md
tech-stack:
  added: []
  patterns: ["dated superseded pointers on the same line; history never rewritten"]
key-files:
  created: []
  modified:
    - .planning/runbooks/traefik-edge-fixforward.md
    - .planning/runbooks/traefik-edge-hardening.md
    - .planning/runbooks/swarm.md
    - .planning/milestones/v1.15-phases/29-edge-reconciliation-source-of-truth/29-REVIEW-DISPOSITION.md
    - .planning/milestones/v1.15-phases/30-v1-v2-syntax-migration-parity/30-REVIEW-DISPOSITION.md
    - .planning/milestones/v1.15-phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW-DISPOSITION.md
    - .planning/milestones/v1.15-phases/32-v3-native-syntax-bc-removal/32-REVIEW-DISPOSITION.md
    - .planning/milestones/v1.15-phases/33-dashboard-lockdown-tls-hardening/33-REVIEW-DISPOSITION.md
decisions:
  - "Deferred v1.15 review findings are collected in one edge-runbook bullet (Recorded for later (after Phase 34), 261012-fqh) and every deferred ledger row points there"
metrics:
  duration: "~25 min"
  completed: 2026-10-12
actuals:
  tokens: 9100
  tasks: 3
  commits: 3
plan_head_before: 8bc1d1d5fe2325304a5b46aeecec7a8979083e7c
plan_head_after: 88d18fd01c09aae762f9486ee711fb378a8c025c
---

# Quick 261012-fqh Plan 01: Fix v1.15 edge documentation drift Summary

The v1.15 edge runbooks now describe the Phase 34 end state. The fix-forward list records EDGE-OPS-03 as closed (PASS, 380 s against the 600 s budget), notes the `traefik_socket-proxy` endpoint rename, and has a new Phase 33 block that closes rows #2–#5. swarm.md gains a post-rollback reconcile note. The 29–33 review ledgers have no `open` rows left; the deferred ones point to a single runbook bullet.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix-forward list: EDGE-OPS-03 closed, WR-02 rename notes, `## Phase 33 resolutions`; superseded pointers in the hardening runbook | `a87d68a8` | traefik-edge-fixforward.md (+41/-4), traefik-edge-hardening.md (4 lines modified in place) |
| 2 | swarm.md post-rollback reconciliation note | `03f5360a` | swarm.md (+22/-0) |
| 3 | Re-disposition 29/30/31/32/33 ledgers + deferred-findings bullet | `88d18fd0` | 5 ledgers, traefik-edge-hardening.md (+11/-0) |

Each task's `<automated>` verify was run on the uncommitted diff before its commit and printed `TASK1-OK`, `TASK2-OK` and `TASK3-OK`.

Plan-level checks after the last commit:
- `git show --stat` of the 3 commits lists only `files_modified` paths.
- `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` prints `MIRROR OK files=1`.
- `git -C ~/Repositories/thinx-swarm status --porcelain` shows only the pre-existing ` M landing`; HEAD is still `88d0e5a`.
- All five ledger frontmatters parse as YAML (checked with ruby psych).

## Hardening-runbook open-gap lines

I appended a pointer on the same physical line to lines 1857, 1976, 1989 and 2034. Each reads "(superseded 2026-10-11 by `### P34 SLA run 2`: … PASS, 380 s within the 600 s budget)", and the 1857 pointer adds "run 2 was measured after all". Lines 902, 1863, 1865 and 2525 already had pointers and were left alone. After this, no line mentioning `OPEN-GAP`/`open gap` lacks an `SLA run 2` reference.

## Final ledger dispositions

**29** (all deferred; counts open 0 / fixed 0 / skipped 0 / deferred 7):
- WR-01 deferred: the problem is latent. The mirror covers only `traefik.yml`, which has 0 `basicauth.users=` labels, and its only templated value is `EMAIL`.
- WR-02 deferred: latent, for the same reason.
- WR-03 deferred: procedurally mitigated, because every regeneration ran on a clean checkout.
- WR-04 deferred: needs a shared module, to be done together with IN-01.
- IN-01 deferred: same shared-module fix as WR-04.
- IN-02 deferred: there is still no `.gitattributes`, and CI runs on Linux.
- IN-03 deferred: `resolveSwarmHead` still returns HEAD without validating it.

**30** (open 0, total 5):
- WR-01 fixed: `677e3a9` / `f90440d5` removed the duplicate, and P33 Stage A removed the router (0 `traefik-public-https`).
- IN-01 fixed: `677e3a9`, plus P33 Stage B set `exposedbydefault=false`.
- IN-02 fixed: `677e3a9` moved the certresolver comment, which now sits directly above the `acme.email` flag (re-checked at traefik.yml lines 127–128).
- IN-03 deferred: the vpn comment still says `1194/udp` (traefik.yml line 114).
- IN-04 deferred: the `net` overlay is still declared (line 247) and nothing references it.

**31** (open 0, total 8):
- IN-05 skipped → fixed: P33 D-08 `6dc974b` / `a68a02ff` (0 `traefik.frontend` labels in docker-swarm.yml and thinx.yml).
- IN-06 skipped → fixed: P32 `17401bb` (0 non-comment `HeadersRegexp`/`ruleSyntax`).

**32** (`updated:` 2026-10-12):
- IN-01 fixed: P33 Stage C file provider, truth 14.
- IN-02 fixed: `6dc974b`, plus `b04f066`.
- IN-03 fixed: `6dc974b` / `a68a02ff`.
- IN-04 fixed: `1578d2f`, `c03c529`, then `8a7a693` / `3d3a31b`. HSTS appears exactly once on 16/16 hosts.
- IN-05 fixed: the WS rule uses `${WEB_HOSTNAME}` (thinx.yml:315).
- IN-06 fixed: 0 `traefik.tcp` labels in thinx.yml.
- IN-07 deferred: downtime.yml still has the duplicate comment and trailing spaces (re-checked).
- IN-08 deferred: the `net` overlay is still declared.
- IN-09 deferred: `error-pages-middleware` is still defined in both traefik.yml and errorpage.yml (3 lines each).

**33** (`updated:` 2026-10-12, plus a dated re-disposition line):
- CR-01, WR-01 and WR-05: unchanged (already fixed).
- WR-02 skipped → fixed: P34 D-18, `1c4d683`. Per `### P34 credential rotation record`, the historic literal gets a 401 challenge, and the hash has been bcrypt since WR-06. The literal is dead but still in history at `158f369`. I named it only and never read its value.
- WR-03 skipped → fixed: `8a7a693`, `3d3a31b` (`security-headers@file`, tls-config-3).
- WR-04 skipped → fixed: `3d3a31b`. thinx.yml:141 and registry.yml:82 are `https-redirect` only, and the P34 Stage D record shows db `:80` returns 301 with 0 `WWW-Authenticate`.
- IN-03 fixed: `8a7a693`. tls.toml has no curve list, and the P34 end-state row shows X25519MLKEM768 negotiated on all 3 checked hosts.
- IN-01 deferred: the scan script still runs `grep -q 'open'` on the whole nmap line (scripts/traefik-edge-scan.sh:91).
- IN-02 deferred: there is still no check that the scanned hosts resolve to `EDGE_IP`.
- IN-04 deferred: traefik.sh has the gid guard but no `set -e`, still runs `docker network create` without a guard, and leaves `$NODE_ID` unquoted (re-checked).
- IN-05 deferred: the `net` overlay is still declared.
- IN-06 deferred: Traefik is pinned by `node.labels.Traefik == true` (traefik.yml:22, 218), but the one-liners still have no empty-container guard.

Every deferred row ends with "→ edge runbook § Recorded for later (after Phase 34), 261012-fqh". That bullet is now in `.planning/runbooks/traefik-edge-hardening.md`, just before "Not scheduled (product decisions)" in the `## Recorded for later (after Phase 34)` section.

## Where the evidence differed from the plan

- **32 IN-02:** the plan said thinx-swarm has 0 `traefik.docker.` labels. A grep finds one, but it is a commented-out line (`#   - traefik.docker.network=traefik-public`) in `downtime/docker-compose.yml`, which is not a stack file. There are 0 active labels, so the row stays **fixed**, and the Source cell mentions the commented line.
- No other differences. Every cited commit (`677e3a9 6dc974b 1578d2f c03c529 8a7a693 3d3a31b 1c4d683 b04f066 d156e79 9204a8e 17401bb 158f369`, and in this repo `a68a02ff f90440d5 44582e7f`) is an ancestor of HEAD. Every cited stage heading and 33-VERIFICATION truth number (1, 2, 3, 5, 7, 9, 10, 12, 14, 17, 18, 19, 20, 22) exists and says what is cited.

## Deviations from Plan

- The plan asked for the swarm.md note to be "about 10–16 lines". It is 22 added lines, counting the fenced command block and the blank lines. The prose is about 15 lines.
- The plan pointed the Task 3 runbook bullet at the `**Not scheduled (product decisions):**` anchor. That anchor appears twice in the runbook (lines 903 and 2562). I inserted the bullet at the occurrence inside `## Recorded for later (after Phase 34)` (2562), as the plan intended.
- I briefly added an `updated: 2026-10-12` key to the 29 and 30 frontmatter, then removed it before committing so those files keep their existing generated format. Only 32 and 33, which already had `updated:`, were bumped.

Otherwise the plan was executed as written. No code, mirror, AGENTS.md or thinx-swarm file was touched. There was no ssh or production access, and no secret value was read or written.

## Threat Flags

None. These are docs-only edits. The `:7442` / `:1883` legacy plaintext paths are described as staying OPEN in both new blocks.

## Self-Check: PASSED

- FOUND: all 8 modified files, each in its commit's `--stat`
- FOUND: a87d68a8, 03f5360a, 88d18fd0 (each is an ancestor of HEAD; `git rev-list --count 8bc1d1d5..HEAD` = 3)
