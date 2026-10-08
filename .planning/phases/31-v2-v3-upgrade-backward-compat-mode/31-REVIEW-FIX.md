---
phase: 31-v2-v3-upgrade-backward-compat-mode
fixed_at: 2026-10-08T11:26:43Z
review_path: .planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW.md
iteration: 2
findings_in_scope: 8
fixed: 6
skipped: 2
status: partial
---

# Phase 31: Code Review Fix Report

**Fixed at:** 2026-10-08T11:26:43Z
**Source review:** .planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 8 (fix_scope = critical,warning,info; the review has 0 critical, 2 warning, 6 info)
- Fixed: 6 (WR-01, WR-02 in iteration 1; IN-01, IN-02, IN-03, IN-04 in iteration 2)
- Skipped: 2 (IN-05, IN-06 — deliberately deferred, see Skipped Issues)

Iteration 1 (2026-10-08T11:16:48Z) fixed the two Warning findings in the operational runbook
`.planning/runbooks/traefik-v3-cutover.md` (commits `9b8e877d`, `37cb80c7`); those rows are kept
below unchanged. Iteration 2 widened the scope to Info and fixed IN-01..IN-04: two comment-only
corrections in the redacted Stage-C captures, one convention sentence in the swarm-configs README,
and a source fix in the sibling `thinx-swarm/traefik.yml` (comments + one overridden duplicate
label) followed by a regeneration of the read-only mirror `docker-compose.traefik.yml`. No command
was run against production (no ssh, no docker). `docker-swarm.yml` was not modified. The mirror was
never hand-edited: it was rewritten only by `scripts/generate-traefik-mirror.js`. Secret hygiene
re-checked after every edit: 0 hash/PEM markers; the only email literal across the touched files is
the pre-existing `rollback-dryrun@example.invalid`.

The sibling commit `thinx-swarm@677e3a9` (branch `master`) is **committed but not pushed** — the
orchestrator pushes it and propagates it to the deploy host. Until it is deployed, the live
`traefik_traefik` service still carries the duplicate label pair in its spec (harmless: compose
collapsed it last-wins, and the live effective value `admin-auth,error-pages-middleware` is exactly
the one kept).

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

### IN-01: `C.pre.yml` predicts "4 provider flags -> 5"; the actual and `C.post`-recorded count is 4

**Files modified:** `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml`
**Commit:** bdc0668d
**Applied fix:** In the capture's trailer comment (lines 126-127) changed `the 4 provider flags -> 5
(providers.swarm x3 + core.defaultRuleSyntax=v2)` to `the 4 provider flags -> 4 (providers.swarm x3 +
core.defaultRuleSyntax=v2; count unchanged at 17)`, which is the wording `C.post.yml:8-9` already
records, so C.post's "exactly as predicted there" is now true and the pair `diff`s cleanly on that
line. Comment-only; the captured spec body (labels, args, mounts) is untouched. The capture still
parses as YAML.

### IN-02: Mirror comments contradict the flags they annotate (fix in `thinx-swarm/traefik.yml`, then regenerate)

**Files modified:** `~/Repositories/thinx-swarm/traefik.yml` (sibling repo, branch `master`, commit `677e3a9`, NOT pushed); `docker-compose.traefik.yml` (regenerated mirror, this repo)
**Commit:** f90440d5 (this repo); `677e3a9` (thinx-swarm, shared with IN-03)
**Applied fix:** In the source `traefik.yml`: replaced the "Do not expose all Docker services, only the
ones explicitly exposed (CHANGED)" line above `--providers.swarm.exposedbydefault=true` with
`# Expose every constraint-matching service by default (P30 D-05: audit deferred to Phase 33)` and
dropped the now-redundant walk-back line ("Value stays true … only the namespace moved" — the
Phase 31 block directly above already explains the namespace move); replaced the misplaced ACME
comment above `--entrypoints.mqtt.address=:1883` with `# Create an entrypoint "mqtt" listening on
port 1883`; and moved the `# Create the certificate resolver "le" for Let's Encrypt, uses the
environment variable EMAIL` comment down so it immediately precedes
`--certificatesresolvers.le.acme.email=${EMAIL?Variable not set}`. Comments only — no flag value,
order or label changed (`grep -c '^ *- --'` = 17 before and after; the parsed `command` array is
17 entries). Then `node scripts/generate-traefik-mirror.js` rewrote `docker-compose.traefik.yml`
(banner now `source: thinx-swarm@677e3a9350e68c1bac203c1ae472c1fd7f99cfd1`, new `mirror-sha256`),
and `node scripts/check-traefik-mirror.js` printed `MIRROR OK files=1` in both integrity-only mode
and freshness mode (`--swarm-repo ~/Repositories/thinx-swarm`). The mirror diff contains only the
two banner lines, comment lines, and the IN-03 label removal.

### IN-03: Duplicate label key `traefik-public-https.middlewares` relies on last-wins conversion

**Files modified:** `~/Repositories/thinx-swarm/traefik.yml` (sibling repo, commit `677e3a9`, NOT pushed); `docker-compose.traefik.yml` (regenerated mirror, this repo)
**Commit:** f90440d5 (this repo); `677e3a9` (thinx-swarm, shared with IN-02)
**Applied fix:** Deleted the first, overridden
`traefik.http.routers.traefik-public-https.middlewares=admin-auth` label line together with its own
comment ("Enable HTTP Basic auth, using the middleware created above") and the whitespace-only line
that followed it; kept the later `admin-auth,error-pages-middleware` line and its comment. That kept
value is exactly what the live capture records (`traefik-edge.C.post.yml:87` and `C.pre.yml:82`:
`admin-auth,error-pages-middleware`), so the deployed effective value does not change.
`grep -c 'traefik-public-https.middlewares' ~/Repositories/thinx-swarm/traefik.yml` = 1 (was 2);
a YAML parse of the source shows a single `middlewares=` label for that router. The regenerated
mirror likewise has exactly one occurrence.

### IN-04: `${DOMAIN}` is templated but its resolved value is written in the adjacent comment

**Files modified:** `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml`, `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml`, `.planning/runbooks/swarm-configs/README.md`
**Commit:** 747b88cc
**Applied fix:** Removed the trailing `# live DOMAIN=micro.thinx.cloud` comment (and its padding)
from `C.pre.yml:74` and `C.post.yml:79`, so the `traefik-public-http.rule` line now reads
`Host(\`${DOMAIN}\`)` exactly like the sibling `traefik-public-https.rule` line three lines below;
both captures still parse as YAML and the C pair stays `diff`-clean on that line. Added one paragraph
to `swarm-configs/README.md` (under Persistence rules, after the Phase 28 `<redacted>` exception)
stating that in the Traefik edge captures every `${DOMAIN}` / `${EMAIL}` / `${USERNAME}` /
`${HASHED_PASSWORD}` reference stays templated and its resolved value is not written into an
adjacent comment either — `${DOMAIN}` is a public DNS name, not a D-12 secret class, but captures
stay consistent. Not touched (not cited by the finding, listed as "carried over"): the same comment
still exists in `traefik-edge.A.pre.yml:71`, `A.post.yml:71`, `B.pre.yml:66`, `B.post.yml:65`;
removing it there is a one-line follow-up per file if the README rule is to apply retroactively.

## Skipped Issues

### IN-05: Dead Traefik v1 labels survive in `docker-swarm.yml` and misdescribe the console/vue security posture

**File:** `docker-swarm.yml:438-439`, `:488-489`, `:243`, `:507`
**Reason:** removing the four dead v1 labels requires live `docker service update --label-rm` on
production plus parity edits in the deployed thinx-swarm `thinx.yml`; out of a docs/mirror fix pass —
tracked for the Phase 33/34 label inventory, and the missing vue `security-headers@swarm` is a
Phase 32/33 item. `docker-swarm.yml` was not edited.
**Original issue:** `traefik.frontend.headers.STSPreload` / `STSSeconds` (console, vue) and
`traefik.backend.*.noexpose` (transformer, worker) are v1 syntax, ignored by v2/v3; the vue labels
imply HSTS although `thinx-vue-console-https` has no `middlewares` label at all.

### IN-06: `HeadersRegexp` matcher depends entirely on the deprecated `core.defaultRuleSyntax=v2` switch

**File:** `docker-swarm.yml:376`; `docker-compose.traefik.yml:114`
**Reason:** Phase 32 scope by design (D-04 BC switch): rename `HeadersRegexp` -> `HeaderRegexp` with a
per-router `ruleSyntax=v3` first. `docker-swarm.yml` was not edited.
**Original issue:** `thinx-api-ws.rule` uses the v2-only `HeadersRegexp` matcher, which parses today
only because of `--core.defaultRuleSyntax=v2` and will hard-fail when Phase 32 drops the switch.

## Verification

- Tier 1 (re-read): performed for every fix — the corrected trailer wording in `C.pre.yml:126-127`,
  the three replaced/moved comment lines and the single remaining `middlewares` label in
  `thinx-swarm/traefik.yml`, the regenerated mirror banner + body, the two `Host(\`${DOMAIN}\`)` lines
  without trailing comment, and the new README paragraph are present; surrounding text intact.
- Tier 2 (syntax/structure): `traefik-edge.C.pre.yml`, `traefik-edge.C.post.yml` and
  `thinx-swarm/traefik.yml` parse with the `yaml` module after each edit; the parsed `traefik.yml`
  has a 17-entry `command` array and exactly one `traefik-public-https.middlewares=` label whose value
  is `admin-auth,error-pages-middleware` (= live per `C.post.yml:87`). `node
  scripts/check-traefik-mirror.js` -> `MIRROR OK files=1` (integrity), and with `--swarm-repo
  ~/Repositories/thinx-swarm` -> `MIRROR OK files=1` (freshness vs `677e3a9`). README is Markdown:
  Tier 1 only.
- Diff discipline: `git diff` of the mirror commit shows no non-comment line change other than the
  removed overridden label line (and its blank line) and the two banner lines; `grep -c '^ *- --'
  docker-compose.traefik.yml` = 17 before and after.
- Secret hygiene (P29 D-12): fixed-string scan for `$apr1$`, `$2y$`/`$2a$`/`$2b$`, `PRIVATE KEY`,
  `BEGIN CERTIFICATE` over the five reviewed files + README = 0 hits after the last commit; email regex
  scan excluding the `example.invalid` placeholder and `@docker`/`@swarm`/`@internal`/`@sh` provider
  suffixes = 0 hits.
- Where verification ran: in the isolated review-fix worktree
  (`.claude/worktrees/rf-31-39250-1791458677`, branch `gsd-reviewfix/31-39250`), fast-forwarded into
  `thinx-staging` at cleanup; the sibling edit ran directly in `~/Repositories/thinx-swarm` (master).
  All checks are plain greps / node scripts over committed files and are reproducible from the main
  checkout at `747b88cc` with `~/Repositories/thinx-swarm` at `677e3a9`.
- No production command was executed (no ssh, no docker). The thinx-swarm commit is not pushed and
  not deployed; the orchestrator owns push + propagation to the deploy host.

---

_Fixed: 2026-10-08T11:26:43Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
