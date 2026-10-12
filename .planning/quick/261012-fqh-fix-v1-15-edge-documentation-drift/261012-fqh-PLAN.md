---
phase: quick-261012-fqh
plan: 01
quick_id: 261012-fqh
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/runbooks/traefik-edge-fixforward.md
  - .planning/runbooks/traefik-edge-hardening.md
  - .planning/runbooks/swarm.md
  - .planning/milestones/v1.15-phases/29-edge-reconciliation-source-of-truth/29-REVIEW-DISPOSITION.md
  - .planning/milestones/v1.15-phases/30-v1-v2-syntax-migration-parity/30-REVIEW-DISPOSITION.md
  - .planning/milestones/v1.15-phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW-DISPOSITION.md
  - .planning/milestones/v1.15-phases/32-v3-native-syntax-bc-removal/32-REVIEW-DISPOSITION.md
  - .planning/milestones/v1.15-phases/33-dashboard-lockdown-tls-hardening/33-REVIEW-DISPOSITION.md
autonomous: true
# v1.15 (archived) requirements whose documentation drifted. Docs alignment only; no requirement status changes.
requirements: [EDGE-OPS-03, EDGE-OPS-02, EDGE-API-01, EDGE-API-02, EDGE-TLS-01, EDGE-TLS-02, EDGE-TLS-03, EDGE-RECON-01]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low   # estimate-calibration: factor 1, sample_count 0

must_haves:
  truths:
    - "traefik-edge-fixforward.md reports EDGE-OPS-03 as closed on 2026-10-11 (sla_verdict PASS, run 2 total 380 s within the 600 s budget the operator raised from 300 s) and points to `### P34 SLA run 2`"
    - "Every line in traefik-edge-hardening.md that mentions the SLA open gap carries a dated pointer to `### P34 SLA run 2` on the same line; no dated stage record is rewritten"
    - "fix-forward Row #7 and the Phase 34 resolutions bullet both name the live endpoint `tcp://traefik_socket-proxy:2375` (34-REVIEW WR-02, thinx-swarm 9204a8e) and still keep the original `tcp://socket-proxy:2375` text as history"
    - "traefik-edge-fixforward.md has a `## Phase 33 resolutions` block between the Phase 30 and Phase 34 blocks that closes rows #2-#5 with evidence pointers (33-VERIFICATION truths, edge runbook stage records) and records the P34 move of HSTS to `security-headers@file` / tls-config-3"
    - "swarm.md's raw-socket rollback section ends with a post-rollback reconciliation note (repo-first traefik.yml reconcile, `node scripts/generate-traefik-mirror.js`, `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` -> `MIRROR OK files=1`, AGENTS.md flag count); swarm.md gets added lines only, so the rollback commands are unchanged"
    - "The 29/30/32/33 review ledgers have no row left at disposition `open`; each re-dispositioned row cites repo evidence (fixed) or a destination (deferred); frontmatter and table agree and the summary counts match; 31 IN-05/IN-06 cite the later fixes"
    - "No secret value appears in any diff, thinx-swarm is untouched, and nothing describes `:7442` / plain MQTT as something to harden away"
  artifacts:
    - path: .planning/runbooks/traefik-edge-fixforward.md
      provides: "Closed EDGE-OPS-03 line, WR-02 rename notes, `## Phase 33 resolutions` block"
      contains: "## Phase 33 resolutions"
    - path: .planning/runbooks/traefik-edge-hardening.md
      provides: "Superseded pointers on the 2026-10-09 open-gap lines; `Recorded for later (after Phase 34)` bullet for the deferred review findings"
      contains: "261012-fqh"
    - path: .planning/runbooks/swarm.md
      provides: "Post-rollback reconciliation note under the raw-socket rollback"
      contains: "MIRROR OK files=1"
    - path: .planning/milestones/v1.15-phases/29-edge-reconciliation-source-of-truth/29-REVIEW-DISPOSITION.md
      provides: "7 rows re-dispositioned, counts consistent"
    - path: .planning/milestones/v1.15-phases/30-v1-v2-syntax-migration-parity/30-REVIEW-DISPOSITION.md
      provides: "5 rows re-dispositioned, `open: 0`"
    - path: .planning/milestones/v1.15-phases/32-v3-native-syntax-bc-removal/32-REVIEW-DISPOSITION.md
      provides: "9 rows re-dispositioned in frontmatter and table"
    - path: .planning/milestones/v1.15-phases/33-dashboard-lockdown-tls-hardening/33-REVIEW-DISPOSITION.md
      provides: "IN-01..IN-06 re-dispositioned; WR-02..WR-04 updated to their Phase 34 outcome"
  key_links:
    - from: .planning/runbooks/traefik-edge-fixforward.md
      to: .planning/runbooks/traefik-edge-hardening.md
      via: "`### P34 SLA run 2` and stage-record headings (`### Stage A record` ... `### Stage E record`, `### P34 Stage C record`)"
      pattern: "P34 SLA run 2"
    - from: ".planning/milestones/v1.15-phases/*/*-REVIEW-DISPOSITION.md (deferred rows)"
      to: ".planning/runbooks/traefik-edge-hardening.md § Recorded for later (after Phase 34)"
      via: "the 261012-fqh bullet that lists every deferred review finding"
      pattern: "261012-fqh"
    - from: .planning/runbooks/swarm.md
      to: "scripts/generate-traefik-mirror.js + scripts/check-traefik-mirror.js"
      via: "post-rollback note commands"
      pattern: "check-traefik-mirror.js --swarm-repo"
---

<objective>
Fix the v1.15 (Traefik Hardening, Edge) documentation drift listed in the `tech_debt` "cross-phase" block of
`.planning/milestones/v1.15-MILESTONE-AUDIT.md`, and re-disposition the review ledgers it names. Docs only.

Purpose: the runbooks and ledgers must describe the Phase 34 end state that AGENTS.md treats as authoritative (24 flags,
tls-config-3, `traefik_socket-proxy`, EDGE-OPS-03 PASS at 600 s). Stale lines make an operator act on a dead state,
which matters most for the rollback.

Output: edited `.planning/runbooks/traefik-edge-fixforward.md`, `.planning/runbooks/traefik-edge-hardening.md`,
`.planning/runbooks/swarm.md`, and the 29/30/31/32/33 `*-REVIEW-DISPOSITION.md` ledgers.

No tracer task. This is a docs-only quick task with no layers to wire and no architecture to prove, so the
`--no-tracer` rationale applies: three independent doc edits, each with its own grep gate.

Hard rules for the executor (all tasks):
- No production access. No ssh, no `docker`, nothing touching micro or core. Every fact comes from this repo and from
  `~/Repositories/thinx-swarm`, which is **read-only** here: `git log`, `git show`, `grep` and reading files are fine;
  never edit, commit, checkout or push there.
- Never read or print `.env`, `/mnt/gluster/...` secrets, `acme.json`, the edge-basicauth file or any credential. Name
  secrets by name or path only. Do not run env-dumping commands (bare `env`, `export`, `set`, `printenv`).
- `:7442` (plaintext HTTP device port) and plain MQTT `:1883` are required for legacy `__DISABLE_HTTPS__` devices
  (AGENTS.md). No new text may frame them as something to close, redirect, TLS-enforce or harden away.
- Dated stage records are history. Do not rewrite them; add dated pointers next to them.
- Do not touch `docker-compose.traefik.yml`, `docker-swarm.yml`, `AGENTS.md`, scripts or code.
- Commit per task on the current branch (`thinx-staging`), docs-style messages (`docs(quick-261012-fqh): …`). Do not push.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/milestones/v1.15-MILESTONE-AUDIT.md
@AGENTS.md
@.planning/runbooks/traefik-edge-fixforward.md

Planner pre-check (2026-10-12; every fact below was re-read from the repos, so the executor re-checks rather than
researches):
- thinx-swarm HEAD `88d0e5a`. The fix commits `677e3a9`, `6dc974b`, `1578d2f`, `c03c529`, `8a7a693`, `3d3a31b`,
  `1c4d683`, `b04f066`, `d156e79` and `9204a8e` are all ancestors of HEAD. Its working tree has one pre-existing
  modification (the `landing` submodule); leave it alone.
- thinx-swarm `traefik.yml`: `--providers.swarm.endpoint=tcp://traefik_socket-proxy:2375`;
  `--providers.swarm.exposedbydefault=false`; `--providers.file.filename=/traefik/tls.toml`;
  `--entrypoints.https.http.middlewares=security-headers@file`; `--entrypoints.mgmt.address=127.0.0.1:8080`;
  0 `traefik-public-https` labels; 0 `basicauth.users=` labels. The certresolver comment sits directly above
  `--certificatesresolvers.le.acme.email=${EMAIL?Variable not set}`. The vpn comment still says `1194/udp` above
  `--entrypoints.vpn.address=:1194`, and the `net:` overlay is still declared with no service joining it. Both
  `error-pages-middleware` definitions are still present (traefik.yml and errorpage.yml, identical bodies). Traefik
  is placed by `node.labels.Traefik == true`.
- thinx-swarm `traefik/tls.toml` has no curve list and defines `[http.middlewares.security-headers.headers]`.
  `thinx.yml` has `thinx-db-http.middlewares=https-redirect`, 0 `traefik.frontend` labels and 0 mosquitto TCP-router
  labels, and the WS rule uses `${WEB_HOSTNAME}`. vault.yml uses `traefik.swarm.network` and has no `ports:`.
  `downtime.yml` still has the duplicated Phase 32 comment (lines 23 and 29) and trailing spaces (22, 25, 27, 31).
  `traefik.sh` has the gid guard (`exit 1`), but no `set -euo pipefail`, and it still runs `docker network create`
  without an inspect guard.
- This repo: `scripts/generate-traefik-mirror.js` and `scripts/check-traefik-mirror.js` are unchanged since
  `44582e7f`; no `.gitattributes`. `scripts/traefik-edge-scan.sh` port loop still does `grep -q 'open'` on the whole
  nmap line, and there is no resolves-to-`EDGE_IP` check. `docker-swarm.yml` has 0 `traefik.frontend` labels (removed
  by `a68a02ff`). `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` prints
  `MIRROR OK files=1`. CI runs the check integrity-only (`.circleci/config.yml` step "Traefik mirror staleness
  (EDGE-RECON-01)").
- The 2026-10-09 open-gap lines in `.planning/runbooks/traefik-edge-hardening.md` that have no run-2 pointer are near
  lines 1857, 1976, 1989 and 2034. Lines 902, 1863, 1865 and 2525 already carry one.
</context>

<tasks>

<task type="auto">
  <name>Task 1: fix-forward list: EDGE-OPS-03 closed, WR-02 rename notes, Phase 33 resolutions block; superseded pointers in the hardening runbook</name>
  <files>.planning/runbooks/traefik-edge-fixforward.md, .planning/runbooks/traefik-edge-hardening.md</files>
  <read_first>
    - .planning/runbooks/traefik-edge-fixforward.md (whole file, 77 lines)
    - .planning/runbooks/swarm.md lines 43-52 (SLA verification result, the authoritative wording)
    - .planning/runbooks/traefik-edge-hardening.md lines 1855-1866, 1935-1941, 1976, 1985-1990, 2030-2035 (grep `OPEN-GAP\|open gap` to locate)
    - .planning/milestones/v1.15-phases/33-dashboard-lockdown-tls-hardening/33-VERIFICATION.md (truths table, rows 1-23)
    - grep `^### Stage [A-E] record\|^### P34 Stage [CDE] record` in .planning/runbooks/traefik-edge-hardening.md to confirm the heading names you cite
  </read_first>
  <action>
1. In `.planning/runbooks/traefik-edge-fixforward.md`, replace the last bullet of `## Phase 34 resolutions` (lines
   73-74, the EDGE-OPS-03 sentence that still describes the 2026-10-09 state) with the closed state, keeping it one
   bullet. Content: EDGE-OPS-03 is still not a fix-forward row. It was an open gap on 2026-10-09 (run 1
   NO-MEASUREMENT). It **closed on 2026-10-11**: `sla_verdict: PASS`, run 2 total 380 s (L1 CI 331 s, L2 40 s, L3 9 s),
   within the 600 s budget the operator raised from 300 s on 2026-10-11. Against the original 300 s the run fails by
   80 s. Pointers: `### P34 SLA run 2` in the edge runbook and `.planning/runbooks/swarm.md` § SLA verification. Use
   the swarm.md wording as the source of truth.
2. Row #7 (table line 21): keep the existing text. At the end of its Target-phase cell, add a dated rename note: since
   34-REVIEW WR-02 (2026-10-09, thinx-swarm `9204a8e`) the endpoint is `tcp://traefik_socket-proxy:2375`, the full
   service name, because the bare `socket-proxy` alias resolves for any `traefik-public` service. Point to
   `.planning/runbooks/swarm.md` § Traefik Docker API socket-proxy. Add the same note, in one sentence, to the Row #7
   bullet under `## Phase 34 resolutions` (line 71, after the Stage B2 sentence). Both lines must keep their original
   `tcp://socket-proxy:2375` text.
3. Insert a new `## Phase 33 resolutions (2026-10-09)` block between `## Phase 30 resolutions` and
   `## Phase 34 resolutions`, in the style of the Phase 30 block: a short intro, one bold `**Row #N — …: DONE.**`
   bullet per row, then a hard-constraint line. Intro: Phase 33 (EDGE-API-01/02, EDGE-TLS-01/02/03) closed rows #2-#5
   live, one `docker service update` per stage from 600-root backups. Verification:
   `.planning/milestones/v1.15-phases/33-dashboard-lockdown-tls-hardening/33-VERIFICATION.md` (passed 23/23). Stage
   records: `.planning/runbooks/traefik-edge-hardening.md`. Bullets:
   - **Row #2, exposedbydefault:** Stage B (33-01 Task 3, D-07) set `--providers.swarm.exposedbydefault=false` (the
     namespace moved docker→swarm in P31). Router inventory was identical before and after, all routers enabled.
     Evidence: `### Stage B record`, truth 9.
   - **Row #3, `--api` + 8080:** Stage A (33-01 Task 1, D-01..D-03) removed the public dashboard routers and their
     basic-auth. `api@internal` is served only by the `traefik-mgmt` router on the loopback `mgmt` entrypoint
     `127.0.0.1:8080` inside the task. There is no `--api.insecure`, and 8080/8443 are closed externally. The
     `--api` flag and the port-8080 service label stay: `--api` is required for the loopback router, and the label
     is LOAD-BEARING. Access is via the ssh plane only (AGENTS.md § Traefik dashboard/API access). Evidence:
     `### Stage A record`, truths 1, 5, 7 and 22, `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md`.
   - **Row #4, ACME:** Stage E (33-02 Task 3, D-22..D-24). The e-mail stays templated `${EMAIL?Variable not set}` and
     resolves to a real operator address (the value is never read or written; `example.com` count 0). `acme.json` is
     600 root. The two stale 2023 files left the live volume, the dead `checkout.qooldata.com` entry was pruned,
     influx was reissued, and the live task logged 0 ACME failures. Evidence: `### Stage E record`, truths 3 and 20.
     Later: `### P34 Stage E record` (34-04, D-19) retired `micro.thinx.cloud`, leaving a 16-entry store, 600 root.
   - **Row #5, TLS min + HSTS:** Stage C (33-02 Task 1) loaded `tls.toml` via
     `--providers.file.filename=/traefik/tls.toml` as docker config `tls-config-2`: TLS 1.2+, AEAD-only. Stage D
     (33-02 Task 2) made `security-headers@swarm` the `https` entrypoint default: exactly one HSTS header on 17 hosts,
     none on `http`, `thinx.cloud` not submitted to preload (D-19). Evidence: `### Stage C record`,
     `### Stage D record`, truths 2, 14, 17, 18 and 19. Changed in P34: `### P34 Stage C record` (34-03, thinx-swarm
     `8a7a693`) moved the middleware into `traefik/tls.toml`, so it is `security-headers@file`, rotated to
     `tls-config-3` and dropped the curve list (Go default incl. X25519MLKEM768). `### P34 Stage D record`
     (`3d3a31b`) retired the swarm copy, and 34-05 removed `tls-config-2` (recreate path in the edge runbook). Current
     state: AGENTS.md § Traefik dashboard/API access.
   - Hard-constraint line: `:7442` and plain MQTT stayed OPEN and direct-published after every Phase 33 change, with
     device-flow harness PASS (truth 12). HSTS, redirects and TLS never touched the plaintext path.
   Before writing, grep each cited heading and truth number. Cite only what exists.
4. In `.planning/runbooks/traefik-edge-hardening.md`, append a dated pointer to each 2026-10-09 open-gap line that
   lacks one: near line 1857 (the operator decision "record the SLA as an open gap; no run 2"), 1976 (the SLA row of
   the P34 end-state matrix: append to its last cell), 1989 (the verdict paragraph) and 2034 (the hand-off
   `thinx_api` line). Each pointer goes **on the same physical line** as the open-gap mention, in the form
   "(superseded 2026-10-11 by `### P34 SLA run 2`: `sla_verdict: PASS`, 380 s within the 600 s budget)". For 1857,
   say that run 2 was measured after all. Do not reword anything else on those lines, and do not touch lines that
   already have a pointer.
  </action>
  <verify>
    <automated>git rev-parse --is-inside-work-tree >/dev/null && F=.planning/runbooks/traefik-edge-fixforward.md; H=.planning/runbooks/traefik-edge-hardening.md; test "$(grep -c 'stays an open gap' $F)" = 0 && grep -q 'sla_verdict: PASS' $F && grep -q '380 s' $F && grep -q 'P34 SLA run 2' $F && test "$(grep -c '^## Phase 33 resolutions' $F)" = 1 && awk '/^## Phase 30 resolutions/{a=NR} /^## Phase 33 resolutions/{b=NR} /^## Phase 34 resolutions/{c=NR} END{exit !(a>0 && a<b && b<c)}' $F && test "$(awk '/^## Phase 33 resolutions/,/^## Phase 34 resolutions/' $F | grep -cE 'Row #[2-5]')" -ge 4 && awk '/^## Phase 33 resolutions/,/^## Phase 34 resolutions/' $F | grep -q 'security-headers@file' && awk '/^## Phase 33 resolutions/,/^## Phase 34 resolutions/' $F | grep -q '33-VERIFICATION' && test "$(grep -c 'tcp://traefik_socket-proxy:2375' $F)" -ge 2 && test "$(grep -c 'tcp://socket-proxy:2375' $F)" -ge 2 && awk '/OPEN-GAP|open gap/ && !/SLA run 2/ {n++} END {exit n>0}' $H && test "$(git diff --numstat -- $H | awk '{d+=$2} END{print d+0}')" -le 8 && test "$(git diff -- $F $H | grep -E '^\+' | grep -cE '\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{40,}|\$apr1\$[./A-Za-z0-9]|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}')" = 0 && echo TASK1-OK</automated>
  </verify>
  <done>The fix-forward list reports EDGE-OPS-03 closed (PASS 380 s, 600 s budget) and names the `traefik_socket-proxy` endpoint next to the kept original text. A `## Phase 33 resolutions` block closes rows #2-#5 with evidence that exists. Every 2026-10-09 open-gap line in the hardening runbook points to `### P34 SLA run 2` on the same line, with no history rewritten (8 or fewer modified lines). No secret in the diff. `TASK1-OK` printed; committed.</done>
</task>

<task type="auto">
  <name>Task 2: swarm.md: post-rollback reconciliation note under the raw-socket rollback</name>
  <files>.planning/runbooks/swarm.md</files>
  <read_first>
    - .planning/runbooks/swarm.md lines 294-385 (§ Traefik Docker API socket-proxy, through the end of the rollback paragraph)
    - scripts/generate-traefik-mirror.js lines 20-35 (usage header) and scripts/check-traefik-mirror.js lines 15-30 (usage header: integrity vs freshness mode)
    - AGENTS.md line with "The static command has **24 flags**"
  </read_first>
  <action>
Insert one new paragraph (prose plus at most one short fenced command block, mirroring the section's style) right
after the paragraph that ends with "regenerate the mirror (`MIRROR OK`)." and before the `---` that closes
§ Traefik Docker API socket-proxy. Add lines only: do not edit, reflow or delete any existing line, especially the two
rollback command blocks and their `# expect:` lines. Bold lead-in: **After a rollback: reconcile repo and mirror.**
Points:
- The restored Args predate later changes. Form 1 (pre-B2 backup) restores the 23 Args as of 2026-10-09 15:16Z, which
  is before the 34-REVIEW WR-02 rename to `tcp://traefik_socket-proxy:2375` and before the later Phase 34 flag changes
  (https default `security-headers@file`, tls-config-3). Form 2 keeps the current Args minus the endpoint flag
  (23 Args). Either way the live service no longer matches thinx-swarm `traefik.yml`, which still has 24 `- --` flags,
  the endpoint flag, the `socket-proxy` service and the `traefik-socket` network.
- Repo-first: once the rollback gate is green, make thinx-swarm `traefik.yml` match the live Args exactly. Use a
  sorted-set compare of the live Args against the `- --` lines, with the e-mail masked on both sides, the same compare
  the stage records use. The two reverts named above are a starting point, not the target: `9204a8e` also carries
  34-REVIEW IN-01..IN-05/IN-07 (healthcheck, gid guard, docs), and later commits touch the same file. Then commit,
  push origin and fast-forward micro's checkout (`/mnt/gluster/deployment/swarm`), as for every edge change.
- Regenerate and check the mirror in this repo: `node scripts/generate-traefik-mirror.js` (default swarm repo
  `~/Repositories/thinx-swarm`), then `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm`,
  expect `MIRROR OK files=1`. Until then the freshness check reports the mirror stale. Hand-editing
  `docker-compose.traefik.yml` instead of regenerating it fails CI's "Traefik mirror staleness (EDGE-RECON-01)" step.
  Commit the regenerated mirror on `thinx-staging`.
- Update the docs that assert the end state: the AGENTS.md "24 flags" line, the mirror's `- --` count, and this
  section's endpoint description. Make them match the rolled-back Args.
- `:7442` and plain MQTT `:1883` are not part of these Args. They stay published by `thinx_api` / `thinx_mosquitto`.
  Confirm them OPEN after the rollback, as in every edge gate.
Write repo paths in the form this file already uses. Keep the note short (about 10-16 lines).
  </action>
  <verify>
    <automated>git rev-parse --is-inside-work-tree >/dev/null && S=.planning/runbooks/swarm.md; git diff --numstat -- $S | awk '{a+=$1; d+=$2} END{exit !(a>0 && d==0)}' && R=$(awk '/^\*\*One-command rollback to the raw socket\.\*\*/,/^## Related v1.x backlog items/' $S) && for t in 'node scripts/generate-traefik-mirror.js' 'node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm' 'MIRROR OK files=1' 'WR-02' 'traefik.yml' 'AGENTS.md' ':7442' 'traefik_socket-proxy'; do printf '%s\n' "$R" | grep -qF -- "$t" || { echo "missing: $t"; exit 1; }; done && test "$(git diff -- $S | grep -E '^\+' | grep -cE '\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{40,}|\$apr1\$[./A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}')" = 0 && node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm && echo TASK2-OK</automated>
  </verify>
  <done>swarm.md gains only added lines (0 deletions), so both rollback commands are byte-identical. The rollback section now says what to do afterwards: reconcile traefik.yml with the live Args (repo-first), regenerate the mirror, run the freshness check expecting `MIRROR OK files=1`, update the AGENTS.md flag count, and confirm `:7442`/`:1883` OPEN. The mirror check still passes. `TASK2-OK` printed; committed.</done>
</task>

<task type="auto">
  <name>Task 3: Re-disposition the 29/30/32/33 review ledgers (plus 31 IN-05/IN-06) and record the deferred findings</name>
  <files>.planning/milestones/v1.15-phases/29-edge-reconciliation-source-of-truth/29-REVIEW-DISPOSITION.md, .planning/milestones/v1.15-phases/30-v1-v2-syntax-migration-parity/30-REVIEW-DISPOSITION.md, .planning/milestones/v1.15-phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW-DISPOSITION.md, .planning/milestones/v1.15-phases/32-v3-native-syntax-bc-removal/32-REVIEW-DISPOSITION.md, .planning/milestones/v1.15-phases/33-dashboard-lockdown-tls-hardening/33-REVIEW-DISPOSITION.md, .planning/runbooks/traefik-edge-hardening.md</files>
  <read_first>
    - the five ledgers above (all short: 27-58 lines)
    - the matching reviews for finding detail: .planning/milestones/v1.15-phases/{29,30,32,33}-*/*-REVIEW.md (Warnings/Info sections only)
    - .planning/milestones/v1.15-phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW-FIX.md (IN-02, IN-03 entries) and .planning/milestones/v1.15-phases/33-dashboard-lockdown-tls-hardening/33-REVIEW-FIX.md (Skipped Issues)
    - .planning/runbooks/traefik-edge-hardening.md § `## Recorded for later (after Phase 34)` (grep the heading; read to end of file)
  </read_first>
  <action>
Re-check each claim below against the current repos before writing it (`grep`/`git log -S`/`git merge-base
--is-ancestor` in `~/Repositories/thinx-swarm`, read-only; `grep` in this repo). If a claim no longer holds, use the
disposition the evidence supports and say why in the SUMMARY. Keep each ledger's existing format: the reason goes in
the Source cell; 30 and 32 frontmatter carry the bare keyword (`fixed` / `deferred`); 33 frontmatter uses its existing
quoted free-text style, e.g. `"fixed (…)"` or `"deferred — …"`. Every `deferred` reason ends with
"→ edge runbook § Recorded for later (after Phase 34), 261012-fqh".

29 (table plus counts). All seven are **deferred**. The mirror scripts are unchanged since `44582e7f`, so none is fixed.
- WR-01, WR-02: latent. The mirror covers thinx-swarm `traefik.yml` only (`MIRROR OK files=1`), which has had 0
  `basicauth.users=` labels since P33 Stage A, and whose only templated value is the `EMAIL` placeholder. Re-open if
  the mirrored file set grows.
- WR-03: procedurally mitigated. Every P31-P34 regeneration ran on a clean checkout (P34 records tracked-dirty 0).
- WR-04, IN-01: one shared-module fix.
- IN-02: still no `.gitattributes`; CI is Linux.
- IN-03: open.
Set the frontmatter counts from the table: open 0, fixed 0, skipped 0, deferred 7.

30 (frontmatter `findings` plus table; set `open: 0`, keep `total: 5`):
- WR-01 **fixed**: 31-REVIEW-FIX IN-03 (thinx-swarm `677e3a9`, this repo `f90440d5`) removed the duplicate, and P33
  Stage A removed the router and admin-auth entirely (0 `traefik-public-https` in traefik.yml).
- IN-01 **fixed**: 31-REVIEW-FIX IN-02 (`677e3a9`) corrected the comment, then P33 Stage B (D-07) flipped the flag to
  `exposedbydefault=false`; comment and flag now agree.
- IN-02 **fixed**: 31-REVIEW-FIX IN-02 (`677e3a9`) moved the certresolver comment to directly above the acme.email flag.
- IN-03 **deferred**: the vpn comment still says 1194/udp over a TCP address; the entrypoint is vestigial (P30 D-03).
- IN-04 **deferred**: the `net` overlay is still declared and unused (same as 32 IN-08 and 33 IN-05).

31 (outside the four ledgers the audit counted, but the audit lists these two as tech debt): IN-05 and IN-06 move from
skipped to **fixed** in frontmatter and table, keeping "31-REVIEW-FIX.md (skipped)" at the start of the Source cell.
- IN-05: P33 D-08 removed the v1 frontend labels (thinx-swarm `6dc974b`, this repo `a68a02ff`; 0 `traefik.frontend`;
  33-VERIFICATION truth 10).
- IN-06: P32 (EDGE-MIG-03) moved to native v3 `HeaderRegexp` and removed the rule-syntax switch (thinx-swarm
  `17401bb`; 0 non-comment `HeadersRegexp`/`ruleSyntax`).
Counts stay open 0, total 8.

32 (frontmatter `findings` plus table; bump `updated:` to 2026-10-12):
- IN-01 **fixed**: P33 Stage C, the `--providers.file.filename=/traefik/tls.toml` flag (tls-config-2, now
  tls-config-3; 33-VERIFICATION truth 14).
- IN-02 **fixed**: `6dc974b` (P33 D-08). vault.yml uses `traefik.swarm.network`, with 0 `traefik.docker.` labels in
  thinx-swarm; `b04f066` also made vault.yml deploy-safe.
- IN-03 **fixed**: `6dc974b` / `a68a02ff`.
- IN-04 **fixed**: P33 Stage D made security-headers the `https` entrypoint default (`1578d2f`, per-router refs
  dropped in `c03c529`), so vue, db and influx are covered. It has been `security-headers@file` since P34 (`8a7a693`,
  `3d3a31b`), and the P34 end state shows exactly 1 HSTS header on each of 16 hosts.
- IN-05 **fixed**: `6dc974b` / `a68a02ff`. The WS rule now uses the WEB_HOSTNAME variable (P33 D-08 chose
  WEB_HOSTNAME over the reviewer's THINX_HOSTNAME); the literal is gone.
- IN-06 **fixed**: `6dc974b` / `a68a02ff` removed the mosquitto TCP-router labels; mosquitto keeps its published
  ports (truth 10).
- IN-07 **deferred**: downtime.yml duplicate comment and trailing spaces remain; YAML trims them, so no live effect.
- IN-08 **deferred**: the `net` overlay.
- IN-09 **deferred**: identical definitions in traefik.yml and errorpage.yml. Removing one is a live label change on a
  running service (repo-first, coordinated label removal).

33 (frontmatter only; bump `updated:` to 2026-10-12; add one dated line under the body text saying the ledger was
re-dispositioned by quick 261012-fqh):
- IN-03 **fixed**: P34 Stage C (D-15, `8a7a693`). tls-config-3 has no curve list, so the Go default incl.
  X25519MLKEM768 applies, and the P34 end state negotiates it ×3.
- IN-01 **deferred**: the scan port loop still matches `open` anywhere on the line; false-FAIL risk only.
- IN-02 **deferred**: no resolves-to-EDGE_IP assertion.
- IN-04 **deferred**: 34-REVIEW IN-02 (`9204a8e`) added only the docker.sock gid guard. There is still no strict mode
  or idempotent network create, and NODE_ID is unquoted; the script is bootstrap-only.
- IN-05 **deferred**: the `net` overlay.
- IN-06 **deferred**: the AGENTS.md / thinx-swarm README one-liners have no empty-container guard; Traefik is pinned by
  `node.labels.Traefik == true`.
- Also update the three rows (WR-02, WR-03, WR-04) whose skip reason reads "recorded for Phase 34" to their P34
  outcome:
  - WR-02 **fixed**: P34 D-18 rotated the couch-auth/influx-auth pair of the same lineage (`1c4d683`). The historic
    literal is challenged with 401 on db and influx (`### P34 credential rotation record`), and the hash has been
    bcrypt since 34-REVIEW WR-06. History still holds the dead literal at `158f369`. Name the record only; no value.
  - WR-03 **fixed**: P34 Stage C/D, `security-headers@file` from tls-config-3 (`8a7a693`, `3d3a31b`).
  - WR-04 **fixed**: P34 Stage D (D-17, `3d3a31b`). `thinx-db-http` and `registry-http` are https-redirect only, and
    the end state shows db `:80` 301 with 0 `WWW-Authenticate`.

Hardening runbook: in `## Recorded for later (after Phase 34)`, insert one bullet just before the
`**Not scheduled (product decisions):**` bullet. Bold lead: "Deferred v1.15 review findings (re-dispositioned
2026-10-12, quick 261012-fqh)". Say they are code/comment quality only, with no live exposure, and group them as:
- mirror tooling: 29 WR-01..WR-04, IN-01..IN-03;
- thinx-swarm clean-up, repo-first with a mirror regen: 30 IN-03, the `net` overlay (30 IN-04 = 32 IN-08 = 33 IN-05),
  32 IN-07, and 32 IN-09 (a live label change);
- edge scan script: 33 IN-01, IN-02;
- traefik.sh: 33 IN-04;
- ssh one-liner guard: 33 IN-06.
Add lines only in this file during this task.
  </action>
  <verify>
    <automated>git rev-parse --is-inside-work-tree >/dev/null && D=.planning/milestones/v1.15-phases; L29=$D/29-edge-reconciliation-source-of-truth/29-REVIEW-DISPOSITION.md; L30=$D/30-v1-v2-syntax-migration-parity/30-REVIEW-DISPOSITION.md; L31=$D/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW-DISPOSITION.md; L32=$D/32-v3-native-syntax-bc-removal/32-REVIEW-DISPOSITION.md; L33=$D/33-dashboard-lockdown-tls-hardening/33-REVIEW-DISPOSITION.md; H=.planning/runbooks/traefik-edge-hardening.md; test "$(cat $L29 $L30 $L32 $L33 | grep -cE '^ +disposition: open$|^\| [A-Z]{2}-[0-9]{2} +\| [a-z]+ +\| open +\|')" = 0 && for L in $L30 $L31 $L32; do diff <(awk '/^ +disposition:/{print $2}' $L) <(awk -F'|' '/^\| (CR|WR|IN)-[0-9]+ /{gsub(/ /,"",$4); print $4}' $L) || exit 1; done && for k in open fixed skipped deferred; do t=$(awk -F'|' -v k=$k '/^\| (WR|IN)-[0-9]+ /{gsub(/ /,"",$4); if($4==k)n++} END{print n+0}' $L29); f=$(awk -v k="$k:" '$1==k{print $2}' $L29); [ "$t" = "$f" ] || { echo "29 count mismatch $k"; exit 1; }; done && grep -q '^open: 0$' $L30 && grep -q '^open: 0$' $L31 && test "$(grep -c 'disposition: "skipped' $L33)" = 0 && test "$(grep -cE '^ +disposition: skipped$' $L31)" = 0 && awk '/^## Recorded for later \(after Phase 34\)/,0' $H | grep -q '261012-fqh' && test "$(git diff -- $L29 $L30 $L31 $L32 $L33 $H | grep -E '^\+' | grep -cE '\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{40,}|\$apr1\$[./A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}')" = 0 && git -C ~/Repositories/thinx-swarm diff --quiet -- traefik.yml traefik/tls.toml thinx.yml downtime.yml errorpage.yml vault.yml registry.yml traefik.sh README.md && test "$(git -C ~/Repositories/thinx-swarm rev-parse HEAD | cut -c1-7)" = 88d0e5a && echo TASK3-OK</automated>
  </verify>
  <done>No row in the 29/30/32/33 ledgers is left `open`. Every `fixed` row names a commit, record or truth that the executor re-checked, and every `deferred` row names its reason and points to the new 261012-fqh bullet. Frontmatter and table agree in 30/31/32, and the 29 counts equal its table. 33 WR-02/03/04 show their P34 outcome, and 31 IN-05/IN-06 cite the later fixes. thinx-swarm is untouched (HEAD `88d0e5a`). No secret in the diff. `TASK3-OK` printed; committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| executor → committed docs | Anything the executor writes into `.planning/` is pushed with thinx-staging later and is readable by anyone with repo access |
| executor → thinx-swarm checkout | Sibling deploy-source repo; micro's deploy checkout ff-merges from it, so a stray edit there can reach production |
| docs → operator | Runbook text drives live edge actions (rollback, reconcile); a wrong instruction becomes a live change |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-fqh-01 | Information disclosure | All edited docs | high | mitigate | Hard rules forbid reading `.env`, secrets files, `acme.json` and the edge-basicauth file. Each task's `<verify>` fails if the added lines contain a bcrypt/apr1 hash body, a UUID (Pilot token form) or an e-mail address |
| T-fqh-02 | Information disclosure | Executor shell | medium | mitigate | Env-dumping commands (bare `env`/`export`/`set`/`printenv`) are forbidden in the objective (memory: subagent env-dump risk) |
| T-fqh-03 | Tampering | thinx-swarm checkout | high | mitigate | Read-only rule. Task 3 verify asserts `git diff --quiet` on the edge files and HEAD == `88d0e5a` |
| T-fqh-04 | Tampering | swarm.md rollback commands | high | mitigate | Task 2 is add-only: its verify requires 0 deleted lines in swarm.md, so neither rollback command can change |
| T-fqh-05 | Tampering | Dated stage records in traefik-edge-hardening.md | medium | mitigate | Pointers are appended on the same line, and Task 1 verify caps modified lines at 8; Task 3 adds lines only |
| T-fqh-06 | Denial of service | Legacy device paths `:7442` / `:1883` | high | mitigate | Hard rule: no text frames them as hardening targets. The new P33 block and the swarm.md note both restate that they stay OPEN |
| T-fqh-07 | Repudiation | Review ledgers | low | mitigate | Each `fixed` row cites a re-checked commit, record or truth. Each `deferred` row names a destination bullet. Any disposition that departs from the plan is explained in the SUMMARY |
| T-fqh-SC | Tampering | npm/pip/cargo installs | low | accept | No package installs in this plan. The legitimacy gate does not apply |
</threat_model>

<verification>
- Each task's `<automated>` command reads the uncommitted working-tree diff (`git diff`), so run it after the task's
  edits and BEFORE that task's commit. Each prints `TASK<N>-OK`.
- After the last commit, `git show --stat --format=%s HEAD~2 HEAD~1 HEAD` lists only files from `files_modified`.
- `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` prints `MIRROR OK files=1`, showing
  the mirror and its source are untouched.
- `git -C ~/Repositories/thinx-swarm status --porcelain` shows only the pre-existing `landing` submodule line.
- Spot-read the new `## Phase 33 resolutions` block and the swarm.md note once for accuracy against AGENTS.md (24 flags,
  tls-config-3, `traefik_socket-proxy`, ssh-plane-only API).
</verification>

<success_criteria>
- All five audit "cross-phase" drift items are closed: fix-forward line 73, Row #7 rename, rows #3-#5 closure block
  (plus #2), swarm.md post-rollback note, and the hardening-runbook OPEN-GAP lines (about 1976/1989, plus 1857/2034).
- 29/30/32/33 review ledgers have 0 `open` rows with consistent counts; 31 IN-05/IN-06 and 33 WR-02/03/04 reflect
  their later fixes.
- Docs-only: no code, mirror, AGENTS.md or thinx-swarm change; no production access; no secret in any diff.
</success_criteria>

<output>
Create `.planning/quick/261012-fqh-fix-v1-15-edge-documentation-drift/261012-fqh-SUMMARY.md` when done. List each
ledger row's final disposition, any row where the evidence differed from this plan, and the commits.
</output>
