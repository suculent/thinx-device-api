---
phase: 31-v2-v3-upgrade-backward-compat-mode
plan: 02
subsystem: infra
tags: [traefik, edge, migration, v3, rollback, acme, snapshot, dry-verify]

# Dependency graph
requires:
  - phase: 31-01
    provides: "converted v3 static command (17 flags), @docker->@swarm + network-label renames in the authoritative source, ordered surgical A/B1/B2/C cutover mechanism, boot-and-discover proof, runbook"
provides:
  - "Out-of-git 600 pre-cutover snapshot of the WORKING v2.11 edge on micro: /mnt/data/edge-rollback/traefik-2026-10-07/{acme.json,resolved-snapshot.yml} (dir 700 root; acme.json byte-identical to the live named volume, 24 certs)"
  - "Full-spec backup /mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json (600 root) — the --args source for the one-command rollback"
  - "Committed redacted live capture swarm-configs/traefik-edge.C.pre.yml (next letter in the series; command+labels identical to B.post; secrets <redacted>, ${VAR} templated)"
  - "Runbook 'Rollback (v3 -> v2.11)' section: acme.json-restore-FIRST, one-command image+args revert (digest d57faa4f, args rebuilt on micro from the backup via jq map(@sh)), @swarm->@docker label revert, Stage-C caveat, verify matrix, regression triggers, dry-verify record"
  - "Dry-verify evidence on isolated scaled-to-zero throwaways with FAKE values: 17/17 args round-trip identical to live incl. the backtick constraint; B2 label revert; cp -a restore keeps 600 root; 0 tasks ever scheduled; live traefik_traefik Version.Index unchanged"
  - "Correction: the converted v3 command is 17 flags (31-01's 18 was an off-by-one) — Plan 03 B1 uses 17"
affects: [31-03, 32, 33]

# Actuals (#2632) — same scale as the plan estimate (chars/4 over the realized diff)
actuals:
  tokens: 7000
  tasks: 2
  commits: 2
plan_head_before: 62d1bf8a24594d0e28dda567e4e9ae5373f58502
plan_head_after: edd9bf86db1e5ed2331f4e0ba42116a0d45a16c8

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rollback args rebuilt ON the host from the 600-root full-spec backup: jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' -> docker service update --args — shlex-safe, backticks and resolved secrets land verbatim without being typed or printed"
    - "Dry-verify on a scaled-to-zero throwaway pinned to a non-existent node label (--replicas 0, --constraint 'node.labels.gsd_never_schedule == true', --no-resolve-image, no ports/mounts/networks) — proves command shape + quoting with zero tasks ever scheduled and nothing pulled"
    - "Redaction performed on micro with sed before output is read (email -> ${EMAIL}, basicauth hash -> ${USERNAME}:<redacted>, DOMAIN templated), so the executor never sees resolved secrets"
    - "Live-untouched proof via docker service inspect .Version.Index equality before/after every host-side task"

key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.C.pre.yml
  modified:
    - .planning/runbooks/traefik-v3-cutover.md
    - .planning/phases/31-v2-v3-upgrade-backward-compat-mode/deferred-items.md

key-decisions:
  - "Rollback image is named by the running digest traefik:v2.11@sha256:d57faa4f… (present on micro by digest only, the exact binary serving production, no registry pull in the recovery path); traefik:v2.11.0 is the committed-tag spelling of the same target (D-03) but that tag is not present locally and would fetch a different v2.11 build"
  - "The one-command rollback rebuilds --args on micro from the 600-root full-spec backup via jq map(@sh), after restoring acme.json from the snapshot FIRST; the traefik service keeps the Stage-A traefik.swarm.network label and gets traefik.docker.network re-added (zero-window bridge mirrored)"
  - "Converted v3 static command count corrected to 17 (two removed, two added); 31-01's '18' and the probe's '18 converted + api.insecure' were an off-by-one (the probe's 19 = 17 + api.insecure + staging caserver)"
  - "Stage-C caveat recorded: if C already removed traefik.docker.network, the rollback must re-add it on the five multi-network services (thinx_api, thinx_mosquitto, thinx_couchdb, thinx_influxdb, swarmpit_app) because the v2 docker provider reads that key"

patterns-established:
  - "traefik-edge.<letter>.pre.yml is captured immediately before the hop and checked for byte parity (command+labels, comments stripped) against the previous .post — proves the baseline did not drift between phases"
  - "Every rollback step carries a # expect: line and a regression-trigger list, so the operator executing it under pressure has pass/fail criteria, not prose"

requirements-completed: [EDGE-MIG-02]

coverage:
  - id: D1
    description: "Fresh out-of-git 600 pre-cutover snapshot on micro: newest /mnt/data/edge-rollback/traefik-*/ dir is 700 root, acme.json 600 root (byte-identical to the live named volume, 24 certs), resolved-snapshot.yml 600 root (17 args, labels, env, mounts, configs, tls.toml)"
    requirement: EDGE-MIG-02
    verification:
      - kind: integration
        ref: "ssh micro \"D=$(ls -d /mnt/data/edge-rollback/traefik-*/ | sort | tail -1); stat -c '%a %U' $D/acme.json\" | grep -qx '600 root' -> PASS; stat dir 700 root; cmp snapshot acme.json vs live -> identical; jq '.le.Certificates|length' -> 24"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full-spec docker service inspect traefik_traefik backup at /mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json, 600 root, out-of-git, captured before any mutation"
    requirement: EDGE-MIG-02
    verification:
      - kind: integration
        ref: "stat -c '%a %U' -> 600 root; jq '.[0].Spec.TaskTemplate.ContainerSpec.Args|length' -> 17; image traefik:v2.11@sha256:d57faa4f…"
        status: pass
    human_judgment: false
  - id: D3
    description: "Committed traefik-edge.C.pre.yml mirrors the B.pre structure, command+labels block identical to B.post (comments stripped), secrets <redacted>, ${EMAIL}/${USERNAME}/${DOMAIN}/${CONFIG} templated, 0 hash/PEM markers"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "test -f traefik-edge.C.pre.yml && test \"$(grep -Ec '\\$apr1\\$|\\$2[aby]\\$|BEGIN |PRIVATE KEY' traefik-edge.C.pre.yml)\" -eq 0 -> PASS; diff of top-level keys vs B.pre -> identical; diff of command+labels (comments stripped) vs B.post -> identical; address-leak grep -> none"
        status: pass
    human_judgment: false
  - id: D4
    description: "Runbook 'Rollback (v3 -> v2.11)' section names all three reverts (image retag to traefik:v2.11.0 / digest, --args revert to the v2.11 17-flag set, @swarm->@docker + network-label revert), the acme.json-restore-FIRST ordering, the staged-ready statement, the Task 1 snapshot by path; 0 hash/PEM markers"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "grep -q 'traefik:v2.11.0' && grep -qi 'acme.json' && grep -qi 'staged-ready' traefik-v3-cutover.md -> PASS; grep -Ec '\\$apr1\\$|\\$2[aby]\\$|BEGIN |PRIVATE KEY' -> 0; snapshot paths referenced 4x each"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dry-verify of the rollback --args quoting + image retag + label reverts on ISOLATED scaled-to-zero throwaways with FAKE values (never the live service): args round-trip identical to live 17/17 with the backtick constraint intact, both the literal-string and the jq-@sh forms; B2 label revert overwrites @swarm with @docker; cp -a restore keeps 600 root; 0 tasks scheduled; throwaways torn down"
    requirement: EDGE-MIG-02
    verification:
      - kind: integration
        ref: "diff <(live Args, email masked) <(throwaway Args, email masked) -> empty (Run A and Run B); Args[1] == --providers.docker.constraints=Label(`traefik.constraint-label`, `traefik-public`); docker service ps gsd_rbdry_* -q | wc -l -> 0; docker service ls --filter name=gsd_rbdry -q | wc -l -> 0 after rm"
        status: pass
    human_judgment: false
  - id: D6
    description: "No live traefik_traefik mutation in this plan (snapshot + dry-verify only)"
    requirement: EDGE-MIG-02
    verification:
      - kind: integration
        ref: "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len …Args}} v={{.Version.Index}}' before/after each host-side task -> identical (traefik:v2.11@sha256:d57faa4f… args=17 v=38379257); task traefik_traefik.1 micro Running 8 hours ago; live acme.json 301146 1791377596 600 root unchanged"
        status: pass
    human_judgment: false
  - id: D7
    description: "The rollback is 'one command away' with cert continuity on a REAL regression (D-02 criterion 2: staged-ready)"
    requirement: EDGE-MIG-02
    verification: []
    human_judgment: true
    rationale: "By design (D-02) the return path is only dry-verified here and executed for real solely on a Plan 03 regression. The command shape, quoting, image availability and the restore mechanics are proven; whether the restarted v2.11 task serves every host off the restored acme.json without an ACME re-challenge was proven live by P30 D-06 with the same mechanism, not re-run in P31. The verifier should judge the staged-ready claim from the runbook's dry-verify record plus the P30 precedent."

# Metrics
duration: "10 min (2026-10-07T20:36:43Z -> 20:47Z)"
completed: 2026-10-07
status: complete
---

# Phase 31 Plan 02: Pre-cutover v2.11 snapshot + staged-ready v3->v2.11 rollback Summary

**The v3 hop is now reversible in one command with cert continuity: a fresh out-of-git 600-root snapshot of the working v2.11 edge (`acme.json` byte-identical to the live store + resolved spec) and a full-spec inspect backup sit on `micro` next to the P30 one, the redacted twin `traefik-edge.C.pre.yml` is committed (identical to `B.post` — the baseline did not drift), and the runbook's rollback section (restore `acme.json` first, then `docker service update --image <d57faa4f digest> --args "$(jq … map(@sh) backup.json)"`, then the three `@docker` label re-adds) was dry-verified on scaled-to-zero throwaways with fake values: 17/17 args round-trip identical to live, backtick constraint intact, zero tasks scheduled, live service `Version.Index` unchanged.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-07T20:36:43Z
- **Completed:** 2026-10-07T20:47Z
- **Tasks:** 2 (both `auto`; no checkpoints hit)
- **Files modified:** 3 (1 created, 2 modified) in this repo; 4 out-of-git files created on `micro`

## Accomplishments

- **Task 1 — snapshot + backup + redacted twin.** Precondition held (live `traefik:v2.11@sha256:d57faa4f…`, 17 args, `80 443`, `/mnt/data/edge-rollback/` root-owned with the P30 dir). Created `/mnt/data/edge-rollback/traefik-2026-10-07/` (700 root) with `acme.json` (600 root, `cmp`-identical to the live named volume, 24 certs) and `resolved-snapshot.yml` (600 root, 92 lines: image, 17-flag command, ports, labels incl. the real `admin-auth` hash, empty env, mounts, configs, network, placement, `tls.toml` body) plus `traefik-p31-precutover-20261007T203816Z.json` (600 root, full inspect). Everything was built under `umask 077` on `micro`; the executor only saw `sed`-redacted output. `traefik-edge.C.pre.yml` committed: same top-level keys as `B.pre`, command+labels byte-identical to `B.post` with comments stripped, secrets `<redacted>`, `${VAR}` templated, 0 hash/PEM markers, no e-mail addresses.
- **Task 2 — rollback documented + dry-verified.** Runbook section "Rollback (v3 -> v2.11) — staged-ready": rollback-target identity (digest vs tag), snapshot table by path, Steps 0-4 with `# expect:` lines (pre-check; `acme.json` restore FIRST; the one-command image+args revert; the `@swarm->@docker` label revert incl. the Stage-C caveat; the P30 verify matrix), regression triggers, the dry-verify record table, and the secret-hygiene statement. Two dry-verify runs on throwaways `gsd_rbdry_traefik` / `gsd_rbdry_app` (`--replicas 0`, unschedulable constraint, no ports/mounts/networks, `--no-resolve-image`, fake ACME email): Run A = literal 17-flag string + `--image traefik:v2.11.0`; Run B = the operator form (digest image + `jq map(@sh)` from a fake-email copy of the backup). Both: 17/17 args `diff`-identical to live (email masked), `Args[1]` constraint with backticks intact, fake email verbatim, labels as expected, 0 tasks ever scheduled, torn down, live `Version.Index 38379257` unchanged.
- **Documentation correction (Rule 1).** The converted v3 command is **17** flags; the three "18" mentions in the 31-01 runbook sections (B1 row, Task 2 table intro, probe args row) were corrected so Plan 03 builds B1 from the right count.

## Task Commits

1. **Task 1: Capture the fresh out-of-git 600 pre-cutover snapshot + full-spec backup + redacted .C.pre.yml** — `a1156a47` (docs)
2. **Task 2: Document and dry-verify the v3->v2.11 rollback procedure** — `edd9bf86` (docs)

**Plan metadata:** finalization commit (docs: complete plan — SUMMARY + deferred-items + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml` (created) — redacted live v2.11 capture immediately pre-hop; header names the out-of-git pair by path
- `.planning/runbooks/traefik-v3-cutover.md` — §"Pre-cutover rollback snapshot (31-02 Task 1)" + §"Rollback (v3 -> v2.11) — staged-ready" appended; 17-flag count corrections in the 31-01 sections
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/deferred-items.md` — one note added (rollback image identity: digest, not the literal `v2.11.0` tag)
- Out-of-git on `micro` (NOT committed, never scp'd): `/mnt/data/edge-rollback/traefik-2026-10-07/acme.json`, `…/resolved-snapshot.yml`, `/mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json`

## Decisions Made

- Rollback image = the running digest `traefik:v2.11@sha256:d57faa4f…` (locally present, exact binary, no pull); `traefik:v2.11.0` remains the committed-tag name of the target (D-03) but is not present on `micro` and would fetch a different v2.11 build.
- `--args` for the rollback are rebuilt on `micro` from the 600-root backup with `jq map(@sh)`; the resolved email/hash are never typed or printed. Both the literal-string and the jq forms were dry-verified.
- The rollback re-adds `traefik.docker.network` on the traefik service and leaves `traefik.swarm.network` in place (zero-window bridge, mirror of Stage A); if Stage C already ran, re-add the docker key on the five multi-network services.
- 31-01 flag count corrected to 17 (see Deviations).

## Deviations from Plan

**1. [Rule 1 - Bug] Converted v3 command flag count corrected from 18 to 17 in the runbook**
- **Found during:** Task 2 (the v3-shaped throwaway built from the committed mirror had 17 args, not 18)
- **Issue:** 31-01 recorded "17 -> 18 flags" and "19 (18 converted + --api.insecure)"; the mirror `docker-compose.traefik.yml` has 17 command lines (two flags removed, two added). Plan 03's B1 `--args` is derived from that count.
- **Fix:** corrected the B1 row (`<17 converted flags>`), the Task 2 table intro, and the probe args row (19 = 17 + probe-only `--api.insecure` + probe-only staging `--caserver`) in `traefik-v3-cutover.md`; noted here. The 31-01 SUMMARY (historical) still says 18 and was left as is.
- **Verification:** `grep -c '^ *- --' docker-compose.traefik.yml` = 17; `grep -n '18 converted\|to \*\*18\*\*\|18 flags' traefik-v3-cutover.md` -> none
- **Files modified:** `.planning/runbooks/traefik-v3-cutover.md`
- **Commit:** `edd9bf86`

**2. [Rule 2 - Missing critical] Rollback image named by digest, with local-availability evidence**
- **Found during:** Task 2 pre-flight (`docker image inspect traefik:v2.11.0` -> "No such image" on `micro`; the running image exists by digest only, tags `[]`)
- **Issue:** the plan words the retag as `traefik:v2.11.0`; executed literally that is a registry-dependent pull of a v2.11 build this edge never ran — a hidden dependency inside the recovery path (T-31-SC: rollback target must be the known-good image).
- **Fix:** the runbook names the digest form as the executed Step 2 reference (the P30 D-06 live rollback used the same), keeps `traefik:v2.11.0` as the committed-tag spelling (plan acceptance), and dry-verified both forms (Run A tag, Run B digest). Deferred-item note added.
- **Verification:** Run B `.Spec.TaskTemplate.ContainerSpec.Image` == the running digest -> yes
- **Files modified:** `.planning/runbooks/traefik-v3-cutover.md`, `deferred-items.md`
- **Commit:** `edd9bf86` (+ finalization commit for deferred-items)

**3. [Rule 2 - Missing critical] Stage-C caveat added to the rollback**
- **Found during:** Task 2 (writing Step 3)
- **Issue:** RESEARCH/plan describe reverting B1 + B2 only; if Plan 03 Stage C (remove `traefik.docker.network` from the other 15 services) has already run, a v2.11 docker provider would auto-select the network on the five multi-network services (31-01 Open Question 2) and could 502 them after the rollback.
- **Fix:** Step 3 documents the conditional `--label-add traefik.docker.network=traefik-public` on `thinx_api`, `thinx_mosquitto`, `thinx_couchdb`, `thinx_influxdb`, `swarmpit_app`.
- **Files modified:** `.planning/runbooks/traefik-v3-cutover.md`
- **Commit:** `edd9bf86`

---

**Total deviations:** 3 (1 Rule 1 documentation bug, 2 Rule 2 additions to the rollback procedure)
**Impact on plan:** No scope change, no production change. All three make the staged rollback and Plan 03's B1 input more accurate; none alters the committed v3 config or the cutover mechanism.

## Issues Encountered

- **Pipeline-masked fallback:** the first image-availability probe piped `docker image inspect` into `sed`, so its `|| echo` fallback never fired and the "local traefik images" line came back empty. Re-checked without the pipe: the image is present by digest only. Recorded correctly in the runbook.
- **Go-template byte slice:** `docker config inspect --format '{{.Spec.Data}}'` prints the raw byte slice, not base64; `{{json .Spec.Data}} | tr -d '"' | base64 -d` is the working form (used for `resolved_tls_toml`).
- **Runbook self-scan:** the first draft quoted the literal secret-marker strings while describing the scan, which the plan's marker grep then matched; reworded to "apr1 / bcrypt hash prefixes, PEM armor headers".
- **`traefik:v3.7.14` is not present on `micro`** (the 31-01 probe image is gone); Plan 03 B1 will pull it — account for pull time inside the window, or pre-pull before the window (`docker pull traefik:v3.7.14` is a no-op for the live service).
- **31-01 SUMMARY still says "18 flags"** in its `provides`/accomplishments; historical, left unchanged — the runbook (the artifact Plan 03 consumes) is corrected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 inputs are complete: the 17-flag converted command (mirror `docker-compose.traefik.yml`), the ordered A/B1/B2/C mechanism + post-B2 gate (31-01), and now the staged rollback keyed to `/mnt/data/edge-rollback/traefik-2026-10-07/` + `traefik-p31-precutover-20261007T203816Z.json`, with its regression triggers and verify matrix.
- Before the window: optionally pre-pull `traefik:v3.7.14` on `micro`; the rollback needs no pull (digest present).
- `thinx-swarm@5e19c000` is still local and unpushed (31-01 readiness item, operator's call).
- The live edge is unchanged by Plans 01-02: `traefik:v2.11@sha256:d57faa4f…`, 17 args, `Version.Index 38379257`, task Running since the P30 cycle; `acme.json` `301146 1791377596 600 root`.

## Self-Check: PASSED

- Files: `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml` FOUND; `.planning/runbooks/traefik-v3-cutover.md` FOUND (rollback section present); `deferred-items.md` FOUND
- Commits reachable from HEAD: `a1156a47`, `edd9bf86` FOUND; `gsd_run check evaluation-scope --plan 31-02 --commits-only` resolved 2 plan-subject commits (exit 0); `git rev-list --count 62d1bf8a..edd9bf86` = 2
- Task 1 `<verify>` re-run: snapshot `acme.json` `600 root` PASS; `.C.pre.yml` present, markers 0 PASS. Task 2 `<verify>` re-run: `traefik:v2.11.0` / `acme.json` / `staged-ready` greps PASS; runbook markers 0 PASS
- Plan-level `<verification>`: newest `traefik-*/` dir `700 root`, `acme.json` `600 root`, `resolved-snapshot.yml` `600 root`, `traefik-p31-precutover-*.json` `600 root`; no bcrypt/apr1/PEM markers in either committed file; rollback section names the retag, the acme-first step, args + label reverts, staged-ready; live `traefik_traefik` `Version.Index` identical before and after every host-side step; `gsd_rbdry*` services 0

---
*Phase: 31-v2-v3-upgrade-backward-compat-mode*
*Completed: 2026-10-07*
