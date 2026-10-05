# Swarmpit upgrade and trim (Phase 28)

This runbook covers the production side of Phase 28: the Step 0 pre-flight, the removal of the
Swarmpit stats stack on 1.9 (Step A), the upgrade of `swarmpit_app` to 1.10 (Step B), the close-out
(Step C), the gate procedure that proves each step with a real push, and the rollback recipes. The
record of what was actually run lives in the **Annex** at the end. Everything recorded there is
aggregates only: counts, sizes, dates, short digests and task IDs.

Decisions referenced as D-NN are in `.planning/phases/28-swarmpit-upgrade-trim/28-CONTEXT.md`;
pitfalls and source evidence are in `28-RESEARCH.md` in the same directory.

---

## Conventions

**Access.** Host names, addresses, keys and ports are not in this public repository. See `AGENTS.md`
§ Deployment and the operator's `~/.aliases`. In this runbook, **`MICRO_SSH`** stands for the literal
manager ssh command from `AGENTS.md` plus `-o BatchMode=yes -o ConnectTimeout=10`, typed in full at
run time so the pre-approved allow rules match. Never put it in a variable, a function, a wrapper or a
committed file. **`CORE_SSH`** is the `core` entry from `~/.aliases`. Use one ssh host per Bash call.
A permission-classifier denial becomes a `checkpoint:human-action` carrying the exact command; never
work around it.

**"On the manager"** means micro (either manager answers `docker service …`, but `docker exec`,
`docker ps` and `docker volume` are node-local). **"On node N"** means the node that currently runs the
task in question.

**Placement floats.** Query it before any node-local command:

```bash
# on the manager
docker service ps swarmpit_db --filter desired-state=running --format '{{.Name}} {{.Node}} {{.CurrentState}}'
```

`swarmpit_app` and `swarmpit_influxdb` are pinned to micro by constraint. `swarmpit_db` is not: both
nodes carry `swarmpit.db-data=true`, so it can float between two divergent `swarmpit_db-data`
volumes (Pitfall 4). Select containers by their swarm service label, never by name substring:

```bash
# on node N
C=$(docker ps -q --filter label=com.docker.swarm.service.name=swarmpit_app | head -1)
```

Query services by name. `docker service ls` returns an unstable subset under load.

**Output hygiene.** Keep only aggregates: counts, sizes, durations, RFC3339 times, 12-hex digest
prefixes, 12-char task IDs. Never registry credentials, Swarmpit user hashes, the CouchDB admin hash,
IP addresses or tokens. Never paste raw `docker service logs swarmpit_app` lines (1.10 logs request
headers and bodies at ERROR); count them with `grep -c`.

**Waiting.** No foreground sleep. Use a bounded until-loop inside the remote command, a background
Bash command, or the Monitor tool.

**Signing.** Commits are GPG-signed. If signing fails because the agent is locked, stop before
pushing and return a `checkpoint:human-action` (unlock gpg, or an explicit operator push-unsigned
exception as in Phase 27, recorded in the Annex as the token p28_unsigned_exception with the reason).
That outcome is NO-MEASUREMENT, never a gate failure.

**Tokens.** Annex tokens are `key=value` and each appears exactly once in this file. Outside the
Annex, a token is named without its `=` sign.

**Windows (D-16).** No production step between 06:00 and 10:00 UTC (the ~06:45 unattended-upgrade
dockerd bounce and the 09:40 log-retention cron). A step, meaning its change, its gate, one rung-1
re-measure and a possible rollback, **starts** only when UTC is not between 05:15 and 10:00. If
05:45 UTC arrives before a started step has recorded PASS, roll that step back from its pre snapshot
and stop. Check `date -u` before every production step. The only commits pushed during the window
are gate commits.

**Change discipline (D-17).** The stack file `/mnt/gluster/deployment/swarm/swarmpit.yml` is the
source of truth.

- Edit it with one deterministic awk script from the step's backup into a temp file, then `mv` the
  temp file over `swarmpit.yml`.
- Check it with `docker stack config -c swarmpit.yml >/dev/null` before deploying.
- Deploy with exactly:
  ```bash
  # on the manager
  cd /mnt/gluster/deployment/swarm && docker stack deploy --resolve-image changed -c swarmpit.yml swarmpit
  ```
  `--resolve-image changed` reuses the resolved digest of every service whose tag did not change, so
  unchanged services get no new task.
- Never `restart.sh`, never a thinx-stack `docker stack deploy`, never `swarmpit.sh` (it re-applies
  node labels), never `--prune`, never the default `--resolve-image always` (it can silently move
  `swarmpit/agent:latest`). Remove a service with an explicit `docker service rm`.
- Images are referenced by tag in the stack file (D-03); the live spec carries the digest the CLI
  resolved.
- Do not tune `registry_registry` limits. Do not change the `db:` block (Pitfall 4: any
  `swarmpit_db` reschedule can swap volumes).
- The gluster swarm directory is a git repo whose HEAD is stale against the working file. The
  working file is the truth; make no gluster git commit in this phase.

**Snapshots (D-17).** Before and after each changing step:

```bash
# Mac, from the repo root
MICRO_SSH 'cat /mnt/gluster/deployment/swarm/swarmpit.yml' > .planning/runbooks/swarm-configs/swarmpit-stack.<step>.pre.yml
grep -Eic 'pass|secret|token|pbkdf2|admins' .planning/runbooks/swarm-configs/swarmpit-stack.<step>.pre.yml   # expect 0, else redact values as <redacted>
# on the manager
cd /mnt/gluster/deployment/swarm && cp -p swarmpit.yml swarmpit.yml.bak.$(date -u +%Y%m%d%H%M%S).p28-<step>-pre
```

Secret values are replaced by `<redacted>` and the file is otherwise bit-exact
(`.planning/runbooks/swarm-configs/README.md`). Never snapshot `swarmpit/couchdb-logging.ini` (it
holds the CouchDB admin hash).

**API pins.** The live `swarmpit_app` carries `SWARMPIT_DOCKER_API=1.44` and
`DOCKER_API_VERSION=1.44`. The engines run 29.8.1 with a minimum API of 1.40, below which 1.9's
built-in default of 1.30 is rejected, so these pins are load-bearing existing state (Pitfall 2). Keep
both through Steps A and B. They are not a new D-02 workaround pin.

---

## Step 0 pre-flight (read-only)

Nothing in production changes here, apart from the root-only dump directory on micro.

1. **Engine gate (D-02).**
   ```bash
   # on the manager
   docker version --format "micro={{.Server.Version}} minapi={{.Server.MinAPIVersion}}"
   docker node inspect core --format "core={{.Description.Engine.EngineVersion}}"
   ```
   If either version matches `^29\.[0-2]\.`, stop before any push: Step B must run before Step A
   (re-plan 28-02/28-03). Do not pin anything as a workaround.
2. **Placement.** For `swarmpit_app`, `swarmpit_db`, `swarmpit_agent`, `swarmpit_influxdb`,
   `thinx_influxdb` and `thinx_api`:
   `docker service ps <svc> --filter desired-state=running --format '{{.Name}} {{.Node}} {{.CurrentState}}'`.
3. **Drift check (D-17).** `stat -c '%s %y' swarmpit.yml`, `docker stack config -c swarmpit.yml >/dev/null`,
   then compare `docker service inspect swarmpit_<svc>` with the file for app, db, influxdb and
   agent: image repo:tag (digest stripped), env, mount source:target, network targets, limits and
   reservations (MiB to bytes, CPUs to NanoCPUs), placement constraints, deploy labels (11 Traefik
   labels on app), healthcheck absent, mode (agent global). Record the number of differing fields
   as the token p28_drift. If it is not 0, reconcile the file to the live spec with no behaviour
   change and snapshot `swarmpit-stack.0.{pre,post}.yml`; no deploy is needed.
4. **Baselines.** `swarmpit_db` task ID, node and spec digest; `swarmpit_agent` task IDs (sorted,
   joined with `+`) and digest; `swarmpit_app` task ID and digest, plus the count of its env pins and
   the presence of `SWARMPIT_INFLUXDB` (names only); `thinx_influxdb` task ID;
   `curl -s https://swarmpit.thinx.cloud/version | jq -c '{version,statistics,docker}'`;
   `du -sh` of the `swarmpit_influx-data` mountpoint on micro; node labels; counts of
   `autoredeploy fired` (thinx_api) and `autoredeploy failed` lines over 24 h.
5. **swarmpit_db dump (D-07).** On micro, where `swarmpit_app` runs; the dump holds the registry
   credentials, so print nothing but counts:
   ```bash
   # on micro
   umask 077; install -d -m 700 /root/phase28; ts=$(date -u +%Y%m%dT%H%MZ)
   C=$(docker ps -q --filter label=com.docker.swarm.service.name=swarmpit_app | head -1)
   F=/root/phase28/swarmpit_db.swarmpit.$ts.json
   docker exec "$C" curl -sf -m 30 "http://db:5984/swarmpit/_all_docs?include_docs=true" > "$F"
   sha256sum "$F" > "$F.sha256"
   echo "path=$F size=$(stat -c %s "$F") rows=$(jq '.rows|length' "$F")"
   jq -r '[.rows[].doc.type]|group_by(.)|map("\(.[0])=\(length)")|join(",")' "$F"
   ```
   Expect 7 rows: `dockerhub=1, migration=3, secret=1, user=1, v2=1`. If `migration` is not 3 or
   `v2` is not 1, the D-06 premise differs from research: stop. Probe `_users`, `_replicator` and
   `_global_changes` `/_all_docs` with `curl -s -o /dev/null -w '%{http_code}'` and record the codes.

   Restore recipe, **ASSUMED** (research A3: anonymous `_bulk_docs` write while the `swarmpit`
   `_security` object is empty; not tested):
   ```bash
   # on micro
   jq '{new_edits:false,docs:[.rows[].doc]}' "$F" | docker exec -i "$C" curl -sf -X POST \
     -H 'Content-Type: application/json' --data-binary @- http://db:5984/swarmpit/_bulk_docs
   ```
   If CouchDB refuses it, stop for the operator.
6. **Rung 1 staged.** `docker service inspect swarmpit_app --format '{{.Spec.Name}}'` resolves and
   `curl -s -o /dev/null -w '%{http_code}' https://swarmpit.thinx.cloud` is 200. The rung-1 command
   `docker service update --force swarmpit_app` (skill `swarm-autopull-recovery`) is held in
   § Gate procedure and is not run in Step 0.

---

## Gate procedure (D-08, D-09, D-10, D-11, D-11a)

Every gate is a real `thinx-staging` push of a phase evidence commit. A `.planning`-only commit does
build and push the api image: `.circleci/config.yml` has no path filter and the image embeds
`COMMIT_SHA` (D-11a, research). In this order:

1. **Readiness before any gate push (Pitfall 3).** `curl -s https://swarmpit.thinx.cloud/version`
   shows the expected `version` and `statistics`; the current `swarmpit_app` task has logged
   `Swarmpit running on port 8080` (count only); at least 60 s have passed since then (the first
   autoredeploy poll). Skip only on gate 0, where `swarmpit_app` has been up for hours.
2. **Gate commit.** A signed commit of that step's snapshots and Annex evidence under `.planning/`.
   Never empty, never containing `[skip ci]` or `[ci skip]`. Record the base
   (`git rev-parse origin/thinx-staging`) before pushing, run the diff-hygiene scan over
   `base..HEAD` (the 28-01 Task 1 verify, `DIFF-HYGIENE-OK`: no secret shapes, no manager endpoint,
   key name or port outside the one scoped 28-CONTEXT.md D-15 line already public in `AGENTS.md`,
   nothing outside `.planning/`, no skip-ci string, every commit signed or covered by a recorded
   unsigned exception), then `git push origin thinx-staging`. Record base and pushed SHA.
3. **SLA start.** Poll, bounded at most 40 × 30 s,
   `https://circleci.com/api/v1.1/project/github/suculent/thinx-device-api/tree/thinx-staging?limit=100&shallow=true`
   for the `api-registry` job of the SHA (`.workflows.job_name == "api-registry"`). When it is
   `success`, read `.steps[].actions[]` of `…/thinx-device-api/<build_num>` whose name starts with
   `Push to private registry`: its `end_time` is **push_end**, and its `output_url` log carries the
   pushed digest (`jq -r '.[].message' | grep -o 'digest: sha256:[0-9a-f]\{64\}' | tail -1`, keep
   12 hex). CircleCI masks the tag as `*****`.
4. **SLA stop.** On the manager, the `thinx_api` task with desired-state running whose
   `{{.Spec.ContainerSpec.Image}}` carries that digest; read
   `docker inspect "$T" --format '{{json .Status.Timestamp}} {{.Status.State}}'` with `T` set to that
   task ID. Always use `{{json …}}` (RFC3339); Docker's default date form gave Phase 27 a false
   negative delta. Poll with a bounded remote loop until push_end + 300 s.
5. **Evidence.** `curl -s -o /dev/null -w '%{http_code}' https://rtm.thinx.cloud/api/v2/csrf-token`
   is 200. `docker service logs swarmpit_app --since <push_end> 2>&1 | grep 'autoredeploy fired' | grep -c thinx_api`
   is at least 1 (count only). The `autoredeploy failed` lines for `thinx_couchdb` and
   `thinx_influxdb` (dhi.io registry not linked in Swarmpit, 401 every minute) are pre-existing noise
   and never a gate signal.
6. **Classification.**
   - **PASS:** a Running `thinx_api` task with the pushed digest and 0 ≤ delta ≤ 300 s.
   - **FAIL:** green `api-registry` but no such task by push_end + 300 s, or delta > 300 s.
   - **NO-MEASUREMENT:** `test` or `api-registry` not green, push not done, or signing blocked.
     Only FAIL triggers D-11. NO-MEASUREMENT allows one new evidence commit recording it; a second
     one becomes a `checkpoint:human-action` (rerun the workflow in the CircleCI UI).
7. **Token.** `p28_gate<G>` with value
   `<PASS|FAIL|NO-MEASUREMENT>,sha=<40 hex>,base=<40 hex>,push_end=<ISO, ms>,running=<ISO, ms>,sla_s=<int>,digest=<12 hex>`,
   G in 0, A, A2, B, B2. Times are truncated to milliseconds with a trailing `Z`.
8. **D-11 on FAIL.** One rung 1 on the manager:
   ```bash
   # on the manager
   docker service update --force swarmpit_app
   ```
   Then readiness again (step 1). Record whether the pending digest landed on the first poll after
   rung 1. Then a second evidence commit (the failure and the rung-1 record), pushed and measured as
   `p28_gate<G>2`. Still FAIL: roll the step back from its pre snapshot (§ Rollback) and stop the
   window with a `checkpoint:decision`.

Gate 0 is the exception to "FAIL triggers D-11": a FAIL on the unchanged stack is pre-existing
breakage, an unexpected state (D-15). Run no recovery command; return a `checkpoint:decision`
carrying the rung-1 command.

---

## Step A — trim on 1.9 (D-01, D-13, D-14)

Removes the Swarmpit stats stack while the app stays on the known 1.9 (plan 28-02).

1. **Pre-state.** Re-read the engine (D-02). Compare placement, `swarmpit_db` task/node/digest,
   `swarmpit_agent` tasks/digest, `swarmpit_app` task and `thinx_influxdb` task with their Step 0
   tokens. Any difference is an unexpected state: stop before any change.
2. **Snapshots and saved config (Pitfall 6).** `swarmpit-stack.A.pre.yml` and the `.p28-A-pre` backup
   as in § Conventions. On micro with umask 077, copy `swarmpit/influxdb.conf` to
   `/root/phase28/influxdb.conf.A.pre` and `swarmpit/influxdb.conf.bak.20260521200918` to
   `/root/phase28/influxdb.conf.bak.20260521200918.A.pre`; `cat` both into
   `.planning/runbooks/swarm-configs/swarmpit-influxdb.A.pre.conf` and
   `swarmpit-influxdb-bak-20260521200918.A.pre.conf`. The live file's sha256 must equal the local
   A.pre's.
3. **Edit** (one awk pass from the backup into `swarmpit.yml.p28tmp`, then `mv`):
   - drop the line `      - SWARMPIT_INFLUXDB=http://influxdb:8086`;
   - drop the `  influxdb:` service block up to, not including, the next `^  [A-Za-z0-9_-]+:$` line
     (`  agent:`);
   - drop `  influx-data:` and the `    driver: local` line directly after it.

   Required before deploying: `docker stack config` parses; `grep -ci influx swarmpit.yml` is 0;
   `diff` against the backup shows 0 added and 20–30 removed lines; exactly app, db and agent remain;
   both 1.44 pins are still on app. Any check failing: restore the backup and stop.
4. **Deploy.** Record the deploy time, run the § Conventions deploy, then
   `docker service rm swarmpit_influxdb`. The volume `swarmpit_influx-data` stays (D-14).
5. **Readiness.** A new `swarmpit_app` task Running (bounded 300 s); `/version` shows `1.9`,
   `statistics` false, API 1.44; `Swarmpit running on port 8080` logged since the deploy; then 60 s.
   Not ready within 8 minutes of the deploy: § Rollback A and stop.
6. **Untouched proofs.** `swarmpit_db` and `swarmpit_agent` tasks, node and digests equal Step 0;
   `thinx_influxdb` task unchanged; `swarmpit_influxdb` absent; `swarmpit_influx-data` still present;
   `swarmpit_db` row count and `v2` document hash equal the dump's (counts and equality flags only).
7. **D-13 mount scan** (Pitfall 5, union of listings), then delete `swarmpit/influxdb.conf` and its
   `.bak` sibling only when the scan finds 0 references:
   ```bash
   # on the manager
   ids=$( { for i in 1 2 3; do docker service ls -q; done; for st in $(docker stack ls --format "{{.Name}}"); do docker stack services "$st" -q; done; } | sort -u )
   echo "services_scanned=$(echo "$ids" | wc -l)"
   for id in $ids; do docker service inspect "$id" --format "{{.Spec.Name}} {{range .Spec.TaskTemplate.ContainerSpec.Mounts}}{{.Source}} {{end}}"; done | grep -c "swarmpit/influxdb.conf"
   ```
8. **A.post snapshot**, Annex row, then Gate A per § Gate procedure.

---

## Step B — upgrade to 1.10 (D-03..D-06)

Plan 28-03. Stack-file delta, nothing else:

```yaml
version: '3.8'          # was '3.3'; required for start_period

services:
  app:
    image: swarmpit/swarmpit:1.10
    environment:
      - SWARMPIT_DOCKER_API=1.44     # keep (Pitfall 2)
      - DOCKER_API_VERSION=1.44      # keep
      - SWARMPIT_DB=http://db:5984
    healthcheck:                      # overrides the 1.10 image HEALTHCHECK (Pitfall 1)
      test: ["CMD", "curl", "-fs", "http://localhost:8080"]
      interval: 60s
      timeout: 10s
      retries: 5
      start_period: 300s
    # volumes / networks / deploy unchanged
```

- The 1.10 image adds `HEALTHCHECK CMD curl --fail -s http://localhost:8080` with no start period;
  at 0.25 CPU the 1.9 JVM needed ~126 s to listen, so without the override the task can be marked
  unhealthy and replaced before it is up.
- `swarmpit_agent` and `swarmpit_db` stay untouched. D-04 reason: no swarmpit/agent release after
  2.2 (2020); the upstream 1.10 compose uses `swarmpit/agent:latest`, which production already runs
  at the current Hub digest.
- D-06: 1.10's CouchDB migration set is identical to 1.9's and all three migrations are already
  recorded in `swarmpit_db`, so 1.10 writes no schema change and keeps `couchdb:2.3.0`. After the
  deploy, `docker service logs swarmpit_app --since <deploy> 2>&1 | grep -cE "Single node setup finished|Change reg types finished|Default token secret created"`
  must be 0.
- `/version` may report `1.10-SNAPSHOT`: assert `version` with the regex `^1\.10` (Pitfall 8),
  `statistics` false and `docker.api` 1.44.
- Snapshots `swarmpit-stack.B.{pre,post}.yml`, backup `.p28-B-pre`, readiness, then Gate B.

---

## Step C — close (D-14)

Plan 28-04, only after Gate B has passed.

- Record `swarmpit_influx-data` (name, node, size) on micro, and check core for a leftover copy
  through `CORE_SSH`; then `docker volume rm swarmpit_influx-data`. One-way.
- Docs: `.planning/runbooks/swarm.md` rungs (no InfluxDB warm-up, 1.10 boot, rung 4 done), the local
  `swarm-autopull-recovery` skill text, follow-ups recorded (not fixed): the double
  `swarmpit.db-data` label, the autoredeploy labels on `thinx_couchdb`/`thinx_influxdb` (dhi.io 401
  noise), the stale `swarmpit.influx-data` label on micro.
- `/root/phase28` shredded (`shred -u` on each file, then `rmdir`) and the removal recorded.

---

## Rollback

**Step A.**

1. Restore `swarmpit/influxdb.conf` first (from `/root/phase28/influxdb.conf.A.pre`, or the committed
   `swarmpit-influxdb.A.pre.conf`); a missing bind source fails the task.
2. `cp -p swarmpit.yml.bak.<ts>.p28-A-pre swarmpit.yml` in `/mnt/gluster/deployment/swarm`.
3. Redeploy with the § Conventions command. This re-creates `swarmpit_influxdb` (pinned to micro, so
   it reattaches the retained `swarmpit_influx-data`) and re-adds `SWARMPIT_INFLUXDB` on the app.
4. Confirm `swarmpit_influxdb` Running and `/version` `statistics` true.

**Step B.**

1. `cp -p swarmpit.yml.bak.<ts>.p28-B-pre swarmpit.yml`, redeploy with the § Conventions command.
   1.9 is pulled from Docker Hub again (swarm-pulled images are untagged here and the daily prune
   removes them).
2. Emergency alternative: `docker service rollback swarmpit_app` (PreviousSpec), then restore the
   file so file and live spec agree.
3. No `swarmpit_db` restore is needed (1.10 writes no migration), unless the D-06 log check found a
   write; then the § Step 0 `_bulk_docs` `new_edits:false` recipe applies (ASSUMED anonymous write;
   if refused, stop for the operator).

---

## Annex

All rows are aggregates. Times are UTC.

| Row | UTC | Evidence |
|---|---|---|
| pre-flight engine | 2026-10-05 10:02 | Read on the manager before any edit or push (D-02). `p28_engine=micro:29.8.1,core:29.8.1`, `p28_minapi=1.40` (micro server API 1.56). Neither version is in 29.0–29.2, so the D-01 order stands: Step A (trim on 1.9) first, then Step B. 1.9's built-in default API 1.30 is below the 1.40 floor, so the live `SWARMPIT_DOCKER_API=1.44` / `DOCKER_API_VERSION=1.44` pins are kept as existing state (Pitfall 2). |
| gate 0 | 2026-10-05 10:12–10:18 | Pre-window push of the Phase 28 planning commits and the runbook/descope commit, measured on unchanged Swarmpit 1.9 (D-08..D-11a). All 7 pushed commits signed, all under `.planning/`; DIFF-HYGIENE-OK (secret 0, endpoint 0, port 0, outside_planning 0, skip_ci 0, unsigned 0). CircleCI `test` #15689 and `api-registry` #15690 green; the `.planning`-only push built and pushed the api image (D-11a confirmed). Running task `zkz1kctc1y8s` carries the pushed digest `b9f5a9c21373`; `autoredeploy fired` lines for thinx_api since push_end: 1 (1 naming the digest); `/api/v2/csrf-token` 200. `p28_gate0=PASS,sha=c53cc788567cbc6d0f0989c057f7ce1117f8b19c,base=c5d5be46a6fa6e7024324ae39a89301c5ae2a4ee,push_end=2026-10-05T10:17:56.022Z,running=2026-10-05T10:18:28.164Z,sla_s=32,digest=b9f5a9c21373` |
| step 0 | 2026-10-05 10:19–10:21 | Read-only pre-flight on unchanged Swarmpit 1.9; nothing in production changed apart from the root-only dump directory. **Placement:** swarmpit_app micro, swarmpit_db **core**, swarmpit_agent micro+core (global 2/2), swarmpit_influxdb micro, thinx_influxdb core, thinx_api micro (the gate 0 task). **Drift (D-17):** `swarmpit.yml` 2875 bytes, mtime 2026-06-11 21:23:23 UTC, `docker stack config` parses, redaction-pattern hits 0; image repo:tag, env, mount source:target:ro, network targets and aliases, limits/reservations (bytes, NanoCPUs), placement constraints, deploy labels (11 Traefik labels on app), healthcheck absent and mode compared for app, db, influxdb and agent (11 fields each): `p28_drift=0`, nothing reconciled, no `swarmpit-stack.0.*` snapshot. **Baselines:** `p28_db_task=isp4hjomiuzg`, `p28_db_node=core`, `p28_db_digest=ee75c9a737e7`; `p28_agent_tasks=bju4mnwpbuz3+tcrkflv13cge`, `p28_agent_digest=1306e2a2f538`; `p28_app_task0=lnae2pqi6e1m`, `p28_app_digest0=8e0f8b86f281`, app env 4 lines (DOCKER_API_VERSION, SWARMPIT_DB, SWARMPIT_DOCKER_API, SWARMPIT_INFLUXDB), both 1.44 pins present, SWARMPIT_INFLUXDB present; `p28_influx_task=lpl1pp201yyi` (swarmpit_influxdb task x32wllasnq5n); `p28_version0=1.9,statistics:true,api:1.44` (engine 29.8.1); `swarmpit_influx-data` on micro 117M. **Node labels (follow-ups only, nothing changed):** both micro and core carry `swarmpit.db-data=true` (Pitfall 4); micro also carries `swarmpit.influx-data=true`. **Autoredeploy, 24 h counts:** `autoredeploy fired` 34 (9 for thinx_api); `autoredeploy failed` 2378 = 1189 thinx_couchdb + 1189 thinx_influxdb (pre-existing dhi.io 401 noise). **D-07 dump:** `/root/phase28/swarmpit_db.swarmpit.20261005T1020Z.json` on micro (dir 700, file 600, `.sha256` alongside, checksum verifies), outside the gluster tree, never printed: `p28_dump=rows:7,dockerhub:1,migration:3,secret:1,user:1,v2:1`, `p28_dump_bytes=2584`. D-06 premise holds (3 migrations, 1 registry doc). System databases `_users` 401, `_replicator` 401, `_global_changes` 401 (admin only, not dumped). **Rung 1 staged:** `docker service inspect swarmpit_app --format {{.Spec.Name}}` resolves to `swarmpit_app`; `https://swarmpit.thinx.cloud` 200; `docker service update --force swarmpit_app` held in § Gate procedure, not run. |
| step A apply | 2026-10-05 11:01–11:05 | Started 11:01 UTC (outside 05:15–10:00, D-16), no per-step approval (D-15). **Pre-state** equal to Step 0 on every token: engines micro 29.8.1 / core 29.8.1 (min API 1.40), swarmpit_db `isp4hjomiuzg` on core digest `ee75c9a737e7`, swarmpit_agent `bju4mnwpbuz3+tcrkflv13cge` digest `1306e2a2f538`, swarmpit_app `lnae2pqi6e1m` digest `8e0f8b86f281`, thinx_influxdb `lpl1pp201yyi`; no thinx-staging CircleCI job running. **Snapshots (D-17):** `swarmpit-stack.A.pre.yml` (2875 bytes, byte-equal to the Step 0 read, redaction hits 0), `p28_A_pre_sha=2f84f4033868` (live file on micro = local A.pre); gluster backup `swarmpit.yml.bak.20261005110213.p28-A-pre` (same hash). Saved conf copies on micro: `/root/phase28/influxdb.conf.A.pre` (372 bytes, `cd6b52c936bf`) and `/root/phase28/influxdb.conf.bak.20260521200918.A.pre` (188 bytes, `ad5da389aa0a`), each equal to its live source; both passed the secret-value gate (0 matching lines) and are committed as `swarmpit-influxdb.A.pre.conf` and `swarmpit-influxdb-bak-20260521200918.A.pre.conf`. **Edit:** one awk pass from the backup into `swarmpit.yml.p28tmp`; checks on the temp file before `mv`: `docker stack config` parses, influx lines 0, 0 added / 25 removed, service keys app, db, agent, both 1.44 pins kept, db and agent blocks byte-identical to the backup. **Deploy:** `p28_A_deploy=2026-10-05T11:02:53.724Z`, `docker stack deploy --resolve-image changed -c swarmpit.yml swarmpit` (updated db, agent, app), then `docker service rm swarmpit_influxdb` at 11:02:54.049Z. **Readiness:** `p28_app_taskA=nn7ssiwqmmmo` Running at 11:02:58.612Z (+5 s); `Swarmpit running on port 8080` logged at 11:04:37.854Z (+104 s, 1 line since the deploy); `Waiting for InfluxDB` lines 0; `/version` `1.9`, statistics false, API 1.44; app spec digest still `8e0f8b86f281`, `SWARMPIT_INFLUXDB` env 0, API pins 2. **Untouched:** swarmpit_db `isp4hjomiuzg` on core digest `ee75c9a737e7`; swarmpit_agent `bju4mnwpbuz3+tcrkflv13cge` digest `1306e2a2f538`; thinx_influxdb `lpl1pp201yyi`, mounts under `swarm/swarmpit/` 0; `swarmpit_influxdb` absent; `influx_vol=1` (`swarmpit_influx-data` kept on micro, D-14); swarmpit_db through the new app container: `rows_same=1` (7 rows) and `v2_same=1` (jq -cS hash of the v2 documents equals the dump's). **A.post:** `swarmpit-stack.A.post.yml`, `p28_A_post_sha=d61396af4b36` (live file = local A.post; 0 added, 25 removed versus A.pre, no influx line, app/db/agent only). |
| gate A | 2026-10-05 11:06–11:12 | First push on the trimmed Swarmpit 1.9 (D-08..D-11a). Readiness before the push (Pitfall 3): `/version` 1.9 statistics false, port line at 11:04:37Z, push at 11:06:41Z (+124 s). Gate commit `docs(28-02): gate A evidence, Swarmpit stats removed on 1.9` plus the three local 28-01 commits, all 4 signed, all under `.planning/`; DIFF-HYGIENE-OK (secret 0, endpoint 0, port 0, outside_planning 0, skip_ci 0, unsigned 0). CircleCI `test` #15696 and `api-registry` #15697 green. thinx_api task `1m5q66fvvpwz` created 11:11:58.733Z, Running with the pushed digest; `autoredeploy fired` lines for thinx_api since push_end: 1 (1 naming the digest); `/api/v2/csrf-token` 200. No rung 1 needed (D-11 not triggered). `p28_gateA=PASS,sha=fb7eceaecef9e4f19208ec1eadbd54980d3028cf,base=c53cc788567cbc6d0f0989c057f7ce1117f8b19c,push_end=2026-10-05T11:11:55.304Z,running=2026-10-05T11:12:26.606Z,sla_s=31,digest=10682b0b5f4d` · `p28_stepA=PASS` |
