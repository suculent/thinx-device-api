# Phase 28: Swarmpit Upgrade & Trim - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 7 (ops-only phase, no application code)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.planning/runbooks/swarmpit-upgrade.md` (new) | runbook | gated prod change + evidence Annex | `.planning/runbooks/influxdb2-upgrade.md` | exact |
| `.planning/runbooks/swarm-configs/swarmpit-stack.<step>.{pre,post}.yml` (new, steps 0/A/B) | config snapshot | file-I/O (off-repo copy) | `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.{pre,post}.nginx` | role-match |
| `.planning/runbooks/swarm-configs/README.md` (modify) | doc | - | itself (Naming convention section) | exact |
| `.planning/REQUIREMENTS.md` (modify, D-12 descope + OPS-SWARM-02 reword) | planning doc | - | itself lines 53-57, 77, 106-108 | exact |
| `.planning/ROADMAP.md` (modify, Phase 28 goal/requirements/SC3) | planning doc | - | itself lines 324-335 | exact |
| `.planning/runbooks/swarm.md` (modify, rungs text) | runbook | - | itself lines 22-70 | exact |
| `.claude/skills/swarm-autopull-recovery/SKILL.md` (modify) | skill doc | - | itself lines 9-16 (git-tracked, verified) | exact |
| Phase plans `28-0N-PLAN.md` | plan | gated ops | `.planning/phases/27-influxdb-2-upgrade/27-05-PLAN.md`, `27-07-PLAN.md` (autonomous: false) | exact |

## Pattern Assignments

### `.planning/runbooks/swarmpit-upgrade.md`

**Analog:** `.planning/runbooks/influxdb2-upgrade.md`

Structure to copy: title `# <Topic> (Phase 28)` + intro paragraph saying the run record lives in the **Annex** at the end and is "aggregates only: counts, sizes, dates, short digests"; then `## Conventions`, pre-flight (read-only), per-step sections, rollback, `## Annex`.

**Conventions block** (lines 10-35), adapt service names:
```markdown
**Access.** Host names, addresses, keys and ports are not in this public repository. See `AGENTS.md`
and the operator's `~/.aliases`. ... "on the manager" means either swarm manager ... "On node N"
means the node that currently runs the task in question, because `docker exec` and `docker ps` are
node-local. Call the manager ssh command in its literal form ... Never put it in a variable, a
wrapper or a committed file.

**Placement floats.** ... look it up:
# on the manager
docker service ps thinx_influxdb --filter desired-state=running --format '{{.Node}} {{.CurrentState}}'

Select the container by its swarm service label, never by `name=influxdb`, which also matches
`swarmpit_influxdb`:
CID=$(docker ps -q --filter label=com.docker.swarm.service.name=thinx_influxdb)

Query services by name. `docker service ls` returns an unstable subset under load.
```
For Phase 28 apply to `swarmpit_db` (Pitfall 4: floats between two divergent volumes) and `swarmpit_app`. Commands are annotated `# on the manager` / `# on node N`.

**Annex tokens** (27-05-PLAN line 141, 209): record machine-checkable `key=value` tokens exactly once (e.g. `p27_window=`, `p27_ref_T=`). Phase 28 equivalent: `p28_engine=`, `p28_gateA_sla=`, `p28_gateB_sla=`, `p28_db_rows=7` etc., so plan `<automated>` checks can `grep -oE 'p28_...=[...]'` the runbook.

### `swarm-configs/swarmpit-stack.<step>.{pre,post}.yml`

**Analog:** README.md "Naming convention" + capture recipe; RESEARCH.md §Snapshot (lines 510-513):
```bash
<ssh micro> 'cat /mnt/gluster/deployment/swarm/swarmpit.yml' > .planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml
grep -Eic 'pass|secret|token|pbkdf2|admins' .planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml   # expect 0
```
Difference from nginx analog: README "Persistence rules" says no redaction; D-17 requires redaction of secrets, so README must gain a YAML-stack exception (redact, otherwise bit-exact for `diff`/rollback). Extend README's "Future OPS phases targeting additional hosts (e.g., `swarmpit.thinx.cloud` ...)" sentence into a concrete `swarmpit-stack.<step>.{pre,post}.yml` entry and an "Established by Phase 28" line.

### `.planning/REQUIREMENTS.md`

Current (lines 55-57):
```markdown
- [ ] **OPS-SWARM-01**: Swarmpit runs 1.10 in production and registry-triggered autoredeploy still completes within the 5-minute SLA
- [ ] **OPS-SWARM-02**: Swarmpit stats are disabled and `swarmpit_influxdb` is removed (the `swarmpit/influxdb.conf` file `thinx_influxdb` mounts is preserved or re-homed); autoredeploy verified by a test push
- [ ] **OPS-SWARM-03**: `swarmpit_agent` is removed; ...
```
Edits: move OPS-SWARM-03 under `## Future Requirements` (line 59) with reason "Swarmpit tasks/stats UI is still used for monitoring; the agent stays."; remove its traceability row (line 108); reword OPS-SWARM-02 parenthetical (file no longer mounted, deleted per D-13). Check counts so v1.14 reads 24/24. Close-out checkbox style: `- [x]` as at lines 50-51.

### `.planning/ROADMAP.md`

Lines 324-335: change `**Requirements**: OPS-SWARM-01, OPS-SWARM-02, OPS-SWARM-03` to drop 03, remove SC3 and renumber SC4 to 3, rephrase Goal ("Its stats stack and agent are gone" -> stats stack gone, agent kept). Plan list style to copy from Phase 27 block (lines ~315-320): `- [x] 28-0N-PLAN.md — <summary> (checkpoint, one-way)` grouped by `**Wave N**`.

### `.planning/runbooks/swarm.md` and `SKILL.md`

Text-only updates (Step C):
- swarm.md line 28: `Wait ~90s ... (Swarmpit 1.9 JVM + CouchDB + InfluxDB warm-up)` -> 1.10, no InfluxDB.
- swarm.md line 68 Rung 4 "Upgrade Swarmpit 1.9 → latest": mark done in Phase 28 (1.10 pinned, link new runbook).
- SKILL.md line 15: `Swarmpit 1.9→latest upgrade` -> rung 4 completed; line 16 History: add Phase 28 line.
Keep the existing literal `ssh micro "docker service update --force swarmpit_app"` style (swarm.md line 25).

### Plans (gated prod change)

**Analog:** `27-05-PLAN.md` / `27-07-PLAN.md`
- frontmatter `autonomous: false`; `must_haves` statements like line 52 ("MUST NOT modify ... until the checkpoint").
- line 101: "A permission-classifier denial becomes a `checkpoint:human-action` with the exact command."
- line 118/175: on failure the executor runs the restoring commands itself, then returns `checkpoint:decision` (Phase 28: rollback from `.pre.yml` + `docker stack deploy`, stop the window per D-11).
- one-way steps (volume rm, D-14) only after the last gate, behind a `checkpoint:decision` (27-07 pattern).

## Shared Patterns

### Secret / IP hygiene (all committed files)
Source: 27-05-PLAN line 209 (`! echo "$OUT" | grep -qE 'http|[0-9a-f]{64}'`) and influxdb2-upgrade.md Conventions.
Apply to runbook, snapshots, SUMMARYs:
```bash
grep -Eic 'pass|secret|token|pbkdf2|admins' <snapshot>   # expect 0
# host, key name and port are derived at run time from AGENTS.md (Phase 27 diff-hygiene scan),
# never typed into a committed file; then: grep -F host/key, grep -E port, grep -E '[0-9a-f]{64}'   # expect none
```
D-07 swarmpit_db dump: counts only, never content (RESEARCH lines 497-506).

### Swarm access
The literal manager ssh command from AGENTS.md § Deployment, typed in full at run time only (memory: micro-ssh-direct-form); never committed. Also correct PATTERNS row above: `.claude/skills/swarm-autopull-recovery/SKILL.md` is NOT git-tracked (`.claude/` is untracked in this repo), so its edit is local-only. Query placement before `docker exec`; services by name, not `docker service ls`. Do not use `restart.sh` (D-17).

## No Analog Found

None. The stack-file YAML snapshot differs from the nginx analog only in the redaction rule (noted above).

## Metadata

**Analog search scope:** `.planning/runbooks/`, `.planning/runbooks/swarm-configs/`, `.planning/phases/27-influxdb-2-upgrade/`, `.claude/skills/swarm-autopull-recovery/`, REQUIREMENTS.md, ROADMAP.md
**Files scanned:** 10
**Pattern extraction date:** 2026-10-04
