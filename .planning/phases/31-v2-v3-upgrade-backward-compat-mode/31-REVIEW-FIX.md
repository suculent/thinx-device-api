---
phase: 31-v2-v3-upgrade-backward-compat-mode
fixed_at: 2026-10-08T11:16:48Z
review_path: .planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 31: Code Review Fix Report

**Fixed at:** 2026-10-08T11:16:48Z
**Source review:** .planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (fix_scope = critical,warning; the review has 0 critical, 2 warning)
- Fixed: 2
- Skipped: 0 in scope; 6 Info findings (IN-01..IN-06) are out of scope and listed below for completeness

Both findings are in the operational runbook `.planning/runbooks/traefik-v3-cutover.md`. The fixes are
documentation edits only: no command was run against production (no ssh, no docker), no stack file
(`docker-swarm.yml`, `docker-compose.traefik.yml`, `traefik-edge.C.*.yml`) was modified, and the
runbook's `ssh micro "…"` + `# expect:` convention is kept. Secret hygiene re-checked after each
edit: 0 hash/PEM markers; the only email literal is the pre-existing `rollback-dryrun@example.invalid`.

## Fixed Issues

### WR-01: Rollback Step 3's mandatory Stage-C re-add is prose-only, un-dry-verified, and leaves a v2.11 network mis-pick window on the five multi-network services

**Files modified:** `.planning/runbooks/traefik-v3-cutover.md`
**Commit:** 9b8e877d
**Applied fix:** Promoted the Stage-C reversal into its own numbered **Step 2** in the rollback return
path, placed BEFORE the retag (v3 still running), as one combined
`docker service update --detach --label-rm traefik.swarm.network --label-add traefik.docker.network=traefik-public <svc>`
per service for `thinx_api thinx_mosquitto thinx_couchdb thinx_influxdb swarmpit_app`, with
`# expect:` lines (5x rc 0, no task restarts, hosts still 200 under v3) and a read-only per-service
label inspect using the runbook's existing `{{range $k,$v := .Spec.Labels}}` idiom. Four "why" bullets
record the ordering rationale (v2.11 mis-pick window; one atomic update so no dual-label state ever
exists under v3; the probe + live post-cutover evidence that v3 auto-selects `traefik-public` for the
five without the label; the eleven single-network services untouched). Renumbered the old Steps 2/3/4
to 3/4/5 and updated every cross-reference: the "Return path" heading now spells out
`0 -> 1 acme.json -> 2 label flip -> 3 retag -> 4 app label revert -> 5 verify`; Step 1's "before Step
2 recreates the task" now says Step 3; the old Step 3 Stage-C bullet is reduced to a pointer at Step 2;
the Regression-triggers numbering, the dry-verify table header ("Run B (the Step 3 form …)") and row,
the Live-cutover "Outcome" line, and the hand-off paragraph ("Steps 1 -> 2 -> 3 -> 4 -> 5") all follow
the new order. Added a dry-verify table row stating the combined five-service form was **NOT
dry-verified** (Run A only covered the same key pair on a throwaway traefik) and is "to be
dry-verified on a throwaway before use" — no verification is claimed that did not happen.

### WR-02: Two rollback statements still assert the dual-label bridge is harmless, contradicting the live correction, and the rollback end state is the exact configuration that broke v3

**Files modified:** `.planning/runbooks/traefik-v3-cutover.md`
**Commit:** 37cb80c7
**Applied fix:** (1) Appended a **CORRECTION (31-03 live, 2026-10-07 22:05Z)** marker to the
"harmless in either direction, so the rollback never has to touch them" passage below the
cutover-mechanism table, stating the clause is false under v3, naming the mandatory Rollback Step 2
flip and the Step 3 `--label-rm`, and pointing at the Re-hop precondition. (2) In Step 3 (the retag),
added `--label-rm traefik.swarm.network \` to the single `docker service update` on `traefik_traefik`,
extended the `# expect:` block with the resulting label state, and replaced the "same bridge as Stage
A, mirrored … Optional later" bullet with a mandatory-not-optional explanation (v2.11 ignores the key,
leaving it parks the edge in the state that broke v3) plus an honest dry-verify coverage note (Run A
exercised the label pair, Run B the digest + `jq` rebuild; not exercised together). (3) Added a
**Re-hop precondition** paragraph under Regression triggers: after a rollback, `traefik_traefik` and
the five carry `traefik.docker.network`; a second B1 must fold Stage C (combined `--label-rm
traefik.docker.network --label-add traefik.swarm.network=traefik-public`) into the same breath, never
as a separate later step and never via the Stage A dual-label bridge, with an instruction to inspect all
16 services' label state before B1. (4) Updated the dry-verify "network labels after" row so Run B is
labelled as the pre-correction Step 3 form.

## Skipped Issues

None in scope. The following Info findings are outside `fix_scope` (critical,warning) and were not
attempted:

### IN-01: `C.pre.yml` predicts "4 provider flags -> 5"; the actual and `C.post`-recorded count is 4

**File:** `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml:126-127`
**Reason:** out of scope (Info severity); also excluded by the run constraints (do not modify `traefik-edge.C.*.yml`)
**Original issue:** Trailer miscounts 3 + 1 as 5; `C.post.yml` records 4 while claiming "exactly as predicted".

### IN-02: Mirror comments contradict the flags they annotate

**File:** `docker-compose.traefik.yml:109-111`, `:129-130`
**Reason:** out of scope (Info severity); fix belongs in `thinx-swarm/traefik.yml` + mirror regeneration, and `docker-compose.traefik.yml` is excluded by the run constraints
**Original issue:** "Do not expose all Docker services" comment sits above `exposedbydefault=true`; ACME comment sits above the mqtt entrypoint.

### IN-03: Duplicate label key `traefik-public-https.middlewares` relies on last-wins conversion

**File:** `docker-compose.traefik.yml:80`, `:86`
**Reason:** out of scope (Info severity); source fix in `thinx-swarm/traefik.yml`, mirror file excluded by the run constraints
**Original issue:** Key set to `admin-auth` then `admin-auth,error-pages-middleware`; last-wins is effective but misleading.

### IN-04: `${DOMAIN}` is templated but its resolved value is written in the adjacent comment

**File:** `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml:74`, `traefik-edge.C.post.yml:79`
**Reason:** out of scope (Info severity); capture files excluded by the run constraints
**Original issue:** `# live DOMAIN=micro.thinx.cloud` comment defeats the templating convention (not a D-12 secret class).

### IN-05: Dead Traefik v1 labels survive in `docker-swarm.yml` and misdescribe the console/vue security posture

**File:** `docker-swarm.yml:438-439`, `:488-489`, `:243`, `:507`
**Reason:** out of scope (Info severity); `docker-swarm.yml` excluded by the run constraints; live label removal would require production commands
**Original issue:** `traefik.frontend.headers.*` / `traefik.backend.*.noexpose` are v1 syntax, ignored by v2/v3; vue has no `security-headers` middleware despite the label implying HSTS.

### IN-06: `HeadersRegexp` matcher depends entirely on the deprecated `core.defaultRuleSyntax=v2` switch

**File:** `docker-swarm.yml:376`; `docker-compose.traefik.yml:114`
**Reason:** out of scope (Info severity); explicitly a Phase 32 item per the review
**Original issue:** `thinx-api-ws` rule uses v2-only `HeadersRegexp`; will hard-fail when the BC switch is dropped.

## Verification

- Tier 1 (re-read): performed for both fixes — the new Step 2 block, renumbered Steps 3-5, the
  CORRECTION marker, the Step 3 `--label-rm`, and the Re-hop precondition are present; surrounding
  text intact; step headers 0-5 sequential; 30 code-fence markers (balanced).
- Tier 2 (syntax check): not applicable — Markdown; fell back to Tier 1 plus content greps
  (`Optional later` = 0 hits, `same bridge as Stage A, mirrored. Optional` = 0 hits, Step 3 block
  contains `--label-rm traefik.swarm.network`).
- Secret hygiene (P29 D-12): fixed-string scan for `$apr1$`, `$2y$`/`$2a$`/`$2b$`, `PRIVATE KEY`,
  `BEGIN CERTIFICATE` = 0 hits after each fix; email regex scan excluding the `example.invalid`
  placeholder and `@docker`/`@swarm`/`@internal`/`@sh` provider suffixes = 0 hits.
- Where verification ran: in the isolated review-fix worktree
  (`.claude/worktrees/rf-31-30506-1791457972`, branch `gsd-reviewfix/31-30506`), fast-forwarded into
  `thinx-staging` at cleanup. The checks are plain greps over the committed file and are reproducible
  from the main checkout at `37cb80c7`.
- No production command was executed (no ssh, no docker). The runbook commands added by WR-01/WR-02
  are documentation and are explicitly marked "NOT dry-verified" in the dry-verify table.

---

_Fixed: 2026-10-08T11:16:48Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
