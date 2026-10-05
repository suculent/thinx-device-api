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

## Phase 28 end state

Recorded 2026-10-05 12:26–12:28 UTC (Annex rows "D-14", "end state", "shred").

**Services and versions.**

| Service | State |
|---|---|
| `swarmpit_app` | `swarmpit/swarmpit:1.10` by tag (spec digest `15c044a82fed`, `/version` `1.10-SNAPSHOT`), statistics false, API pins 1.44 kept, stack-file healthcheck with a 300 s start period, on micro |
| `swarmpit_db` | `couchdb:2.3.0` (`ee75c9a737e7`), task `isp4hjomiuzg` on core, unchanged from Step 0 to the end, no migration, all 7 documents equal to the D-07 dump at Step B |
| `swarmpit_agent` | `swarmpit/agent:latest` (`1306e2a2f538`), global, tasks unchanged from Step 0 (D-04: no release after 2.2) |
| `swarmpit_influxdb` | removed in Step A; its config files removed under D-13; its volume removed on micro under D-14 |

The stack file `/mnt/gluster/deployment/swarm/swarmpit.yml` is compose 3.8 and equals
`swarm-configs/swarmpit-stack.B.post.yml`.

**Gate deltas** (CircleCI push_end → `thinx_api` task Running, SLA 300 s):

| Gate | Swarmpit | Delta |
|---|---|---|
| 0 | 1.9 with stats (unchanged) | 32 s |
| A | 1.9, stats stack removed | 31 s |
| B | 1.10 | 50 s |

No re-measure was needed: rung 1 (D-11) never ran.

**Rollback sources that remain.**

- Gluster backups next to the stack file: `swarmpit.yml.bak.20261005110213.p28-A-pre` and
  `swarmpit.yml.bak.20261005112754.p28-B-pre`.
- Committed snapshots in `.planning/runbooks/swarm-configs/`: `swarmpit-stack.{A,B}.{pre,post}.yml`
  and the two `swarmpit-influxdb*.A.pre.conf` copies.
- Step B rollback (back to 1.9) is unchanged.
- A Step A rollback now starts an **empty** InfluxDB: `swarmpit_influx-data` is gone on micro, so
  the old stats history cannot come back. Restore the conf files from the committed copies first
  (the `/root/phase28` copies were shredded).
- The D-07 swarmpit_db dump was shredded at close. swarmpit_db itself was never written by Phase 28.

**Follow-ups (recorded, not fixed)**

- **Core `swarmpit_influx-data` (D-14, open).** Core also holds a `swarmpit_influx-data` volume
  (research A6 assumed none). The operator holds its removal: `p28_d14_core` is pending-operator,
  with the exact command in the Annex row "D-14". Record its CreatedAt and size before removing it.
- **Double `swarmpit.db-data` label (Pitfall 4).** Both nodes are labelled `swarmpit.db-data=true`,
  and micro holds a stale 2022 `swarmpit_db-data`. Any swarmpit_db reschedule from core to micro
  swaps volumes and loses the current Swarmpit users, registry link and settings.
- **Stale `swarmpit.influx-data` label.** Micro still carries `swarmpit.influx-data=true`, which
  nothing uses now.
- **dhi.io autoredeploy noise.** `swarmpit.service.deployment.autoredeploy=true` on `thinx_couchdb`
  and `thinx_influxdb` makes Swarmpit log an `autoredeploy failed` 401 every minute for each (dhi.io
  is not linked in Swarmpit). This is the thinx stack, out of D-17 scope.
- **Gluster git HEAD.** The swarm directory's git HEAD is stale against the working `swarmpit.yml`;
  no gluster git commit was made in this phase.
- **docker-ce 29.8.2** is pending on micro (not auto-upgraded; the engine is still 29.8.1).
- **`swarmpit/agent:latest`** can move on a future deploy that uses the default
  `--resolve-image always`. Keep `--resolve-image changed`, or pin the agent digest deliberately.
- **Closed:** the Phase 27 "Swarmpit `influxdb` DNS" follow-up
  (`.planning/runbooks/influxdb2-upgrade.md` § Phase 28 follow-ups) is resolved by Step A:
  `swarmpit_app` no longer has `SWARMPIT_INFLUXDB`, so the bare `influxdb` name is never resolved.

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
| D-13 | 2026-10-05 11:14–11:16 | **Union mount scan (Pitfall 5)** on the manager after p28_stepA reached PASS: service IDs = sorted union of 3× `docker service ls -q` and `docker stack services <stack> -q` for all 10 stacks; `p28_services_scanned=21`, stable over a second 5× listing and equal to the per-stack sum (thinx 9, swarmpit 3 after the removal of swarmpit_influxdb, fotostim 2, seven single-service stacks). Mount Sources ending in `swarmpit/influxdb.conf`: `p28_conf_refs=0`. The only service mounting anything under `swarm/swarmpit/` is swarmpit_db (`couchdb-logging.ini`). Containers: micro 25 (`docker ps -aq`), 0 references; core 15, 0 references. **Deletion:** the executor's permission classifier refused the exact-path `rm -f`, so it was held for the operator (no workaround attempted). After operator approval, the orchestrator ran it at 2026-10-05T11:19:01Z on micro, exact paths only (no glob): `swarmpit/influxdb.conf` (372 bytes, `cd6b52c936bf`) and `swarmpit/influxdb.conf.bak.20260521200918` (188 bytes, `ad5da389aa0a`) removed from `/mnt/gluster/deployment/swarm/`. **After (11:22 UTC, D13-OK):** services scanned 21, references 0; `influxdb.conf*` entries left in `swarm/swarmpit/` 0; `couchdb-logging.ini` present; both copies `/root/phase28/influxdb.conf.A.pre` and `/root/phase28/influxdb.conf.bak.20260521200918.A.pre` present, hashes unchanged (`cd6b52c936bf`, `ad5da389aa0a`), also committed as `swarmpit-influxdb.A.pre.conf` and `swarmpit-influxdb-bak-20260521200918.A.pre.conf`; swarmpit_db task still `isp4hjomiuzg`; swarmpit_app task still `nn7ssiwqmmmo` (= `p28_app_taskA`); `/version` 1.9, statistics false, API 1.44; `swarmpit_influx-data` still on micro (`influx_vol=1`, D-14). § Rollback A restores the conf from these copies first. **Observation for Step C:** core also holds a `swarmpit_influx-data` volume (research A6 assumed none). |
| step B apply | 2026-10-05 11:27–11:31 | Started 11:27 UTC (outside 05:15–10:00, D-16), no per-step approval (D-15). **Pre-checks:** engines micro 29.8.1 / core 29.8.1 (min API 1.40, D-02 order stands); swarmpit_db `isp4hjomiuzg` on core digest `ee75c9a737e7`, swarmpit_agent `bju4mnwpbuz3+tcrkflv13cge` digest `1306e2a2f538`, swarmpit_app `nn7ssiwqmmmo` (= `p28_app_taskA`) on `swarmpit/swarmpit:1.9@8e0f8b86f281`; Docker Hub `swarmpit/agent` tags are `latest`, `2.2`, `2.1`, `2.0` only (no release after 2.2; `latest` = `1306e2a2f538` = production), so the D-04 premise holds; `docker manifest inspect swarmpit/swarmpit:1.10` succeeds on micro, `p28_B_index_digest=15c044a82fed` (equals research); D-07 dump present, checksum verifies; no thinx-staging CircleCI job running. **Snapshots (D-17):** `swarmpit-stack.B.pre.yml` (2270 bytes, byte-equal to `swarmpit-stack.A.post.yml`, redaction hits 0), `p28_B_pre_sha=d61396af4b36` (live = A.post); gluster backup `swarmpit.yml.bak.20261005112754.p28-B-pre` (same hash). **Edit:** one awk pass from the backup into `swarmpit.yml.p28tmp` (each of the three anchors matched exactly once); checks on the temp file before `mv`: `docker stack config` parses under 3.8, 2 removed / 8 added (version line, image line, six healthcheck lines), `@sha256` in file 0. **Deploy:** `p28_B_deploy=2026-10-05T11:28:17Z`, `docker stack deploy --resolve-image changed -c swarmpit.yml swarmpit` (CLI printed "Updating" for app, db, agent; only app got a new task). **Readiness and health:** `p28_app_taskB=e3qc53lt51jg` created 11:28:18.671Z, container started 11:28:33.518Z, health checks during the start period exited 7 (connection refused) at 11:29:45, :51, :57 and 11:30:03 (not counted, start period), first exit 0 at 11:30:09 → `healthy` (+112 s); `Swarmpit running on port 8080` at 11:30:08.761Z (+111 s); task Running at 11:30:12.378Z (+115 s; with a healthcheck, swarm holds the task in Starting until healthy); `/version` `1.10-SNAPSHOT`, statistics false, API 1.44 at 11:30:25Z; same task throughout, failing streak 0. **Log counts** since the deploy (counts only, no lines quoted): `Swarmpit running on port 8080` 1, `Swarmpit DB already exist` 1, `Single node setup finished|Change reg types finished|Default token secret created` 0, ERROR 1 (not inspected beyond the count). **D-06 (swarmpit_db, through the new app container, against the D-07 dump):** `rows_same=1` (7 = 7), types `dockerhub=1,migration=3,secret=1,user=1,v2=1`, `migrations=3`, `v2_same=1`, and the jq -cS hash of all 7 documents equals the dump's (no additive docs either). **Untouched (D-04, D-06):** swarmpit_db `isp4hjomiuzg` on core digest `ee75c9a737e7`; swarmpit_agent `bju4mnwpbuz3+tcrkflv13cge` digest `1306e2a2f538`. **App spec:** image `swarmpit/swarmpit:1.10@sha256:15c044a82fed…` (spec digest = index digest), env names DOCKER_API_VERSION, SWARMPIT_DB, SWARMPIT_DOCKER_API (both 1.44 pins, `SWARMPIT_INFLUXDB` 0), healthcheck test `curl -fs http://localhost:8080`, interval 1m0s, StartPeriod 5m0s. **B.post:** `swarmpit-stack.B.post.yml` (2429 bytes), `p28_B_post_sha=0fd7d2c2de8d` (live file on micro = local B.post). |
| gate B | 2026-10-05 11:32–11:38 | First push on Swarmpit 1.10 (D-08..D-11a). Readiness before the push (Pitfall 3): `/version` `1.10-SNAPSHOT` statistics false, port line at 11:30:08Z, push at 11:32:17Z (+129 s). Gate commit `docs(28-03): gate B evidence, Swarmpit 1.10` plus the five local 28-02 commits, all 6 signed, all under `.planning/`; DIFF-HYGIENE-OK (secret 0, endpoint 0, port 0, outside_planning 0, skip_ci 0, unsigned 0). CircleCI `test` #15704 and `api-registry` #15705 green. thinx_api task `ydaoq586u8v5` created 11:37:10.917Z, Running with the pushed digest; `autoredeploy fired` lines for thinx_api since push_end: 1 (1 naming the digest); `autoredeploy failed` since push_end 2 (1 thinx_couchdb + 1 thinx_influxdb, the pre-existing dhi.io 401 noise); `/api/v2/csrf-token` 200; swarmpit_app task still `e3qc53lt51jg`. No rung 1 needed (D-11 not triggered). `p28_gateB=PASS,sha=b8f1bf15a10738ae65c6d703cfd3ba2dd49b42e4,base=fb7eceaecef9e4f19208ec1eadbd54980d3028cf,push_end=2026-10-05T11:36:43.589Z,running=2026-10-05T11:37:33.399Z,sla_s=50,digest=f55fa456ca23` · `p28_stepB=PASS` |
| step B stability | 2026-10-05 11:38–11:39 | **Hold (Pitfall 1):** read at 11:38:38Z, `p28_B_stable_min=10` since the Step B deploy (no rung 1 ran). swarmpit_app task still `e3qc53lt51jg` (= `p28_app_taskB`), health `healthy`, FailingStreak 0, container RestartCount 0, container up since 11:28:33Z; the start period ended 11:33:33Z and the five checks after it (11:34:15, 11:35:16, 11:36:16, 11:37:17, 11:38:17, 60 s apart) all exited 0. `docker service ps swarmpit_app` lists no task created after the deploy other than `e3qc53lt51jg` (the others are `nn7ssiwqmmmo`, shut down by the deploy, and the older 1.9 history). **D-04:** Agent unchanged in Step B: no swarmpit/agent release after 2.2; upstream 1.10 compose uses agent:latest, which production already runs at the Step 0 digest. Docker Hub tags read at 11:27 UTC: `latest`, `2.2` (2020-04-28), `2.1`, `2.0`; `latest` digest `1306e2a2f538` = the live swarmpit_agent spec digest = `p28_agent_digest`; swarmpit_agent tasks `bju4mnwpbuz3+tcrkflv13cge` (= Step 0). swarmpit_db `isp4hjomiuzg` on core (= Step 0). **UI and noise:** `https://swarmpit.thinx.cloud/` 200. `docker service logs swarmpit_app --since <gate B push_end>` up to 11:38:46Z, counts only: `autoredeploy fired` naming thinx_api 1; `autoredeploy failed` 4 (2 thinx_couchdb + 2 thinx_influxdb, the pre-existing dhi.io 401 noise, a follow-up for Step C docs, not a signal); ERROR lines 4, all of them `autoredeploy failed` lines (0 other ERROR lines). The operator tasks-UI check (live CPU/memory from swarmpit_agent; timeseries "Statistics disabled") is left for end-of-phase UAT. |
| D-14 | 2026-10-05 12:25–12:27 | Started 12:25 UTC (outside 05:15–10:00, D-16), after `p28_stepB` PASS and `p28_B_stable_min` 10 (D-14 after the last gate), no per-step approval (D-15). Precondition: `swarmpit_influxdb` absent on the manager (`influx_svc=0`). **Reference scan (micro, 12:26:07Z):** containers using the volume 0 (`docker ps -aq --filter volume=swarmpit_influx-data`); service specs scanned 21 (union of 3× `docker service ls -q` and `docker stack services <stack> -q`), mount Sources equal to `swarmpit_influx-data` 0 (this scan is cluster-wide, so it also covers services placed on core). **Record before removal (micro):** name `swarmpit_influx-data`, node micro, exists 1, driver local, label `com.docker.stack.namespace=swarmpit`, CreatedAt 2022-02-11T14:31:15Z, `du -sh` of the mountpoint 130M (132 files; 117M at Step 0, before InfluxDB's shutdown flush in Step A). `swarmpit_db-data` on micro: count 1 (CreatedAt 2022-02-07, the stale copy from Pitfall 4, kept). **Removal (micro, 12:26:19Z):** `docker volume rm swarmpit_influx-data` by exact name, exit 0; no prune, no pattern. After: `influx_vol=0`, `db_vol=1`. `p28_d14_removed=micro:130M`. **Core:** 28-02 saw a `swarmpit_influx-data` volume on core as well (research A6 assumed none). Its name, size and CreatedAt were not read in 28-04: reaching core needs `CORE_SSH`, a host outside the literal manager ssh form, and the operator chose to hold that for a human run. Recorded as the token `p28_d14_core=pending-operator` with the command below. `swarmpit_db-data` on core is in use by the running swarmpit_db task (`isp4hjomiuzg` on core mounts `volume:swarmpit_db-data`), so it exists there; it is not touched. Operator command for core (one ssh host per call, exact name, nothing else): `CORE_SSH 'docker ps -aq --filter volume=swarmpit_influx-data \| wc -l; docker volume inspect swarmpit_influx-data --format "{{.CreatedAt}} {{.Mountpoint}}"; du -sh "$(docker volume inspect swarmpit_influx-data --format "{{.Mountpoint}}")"; docker volume rm swarmpit_influx-data; docker volume ls -q \| grep -cx swarmpit_influx-data; docker volume ls -q \| grep -cx swarmpit_db-data'` (expect 0 containers, then `swarmpit_influx-data`, then 0 and 1). |
| end state | 2026-10-05 12:26–12:27 | One pass on the manager (12:26:38Z) and from the Mac (12:26:55Z). **Swarmpit:** `/version` `1.10-SNAPSHOT`, statistics false, API 1.44; UI 200. The swarmpit stack holds swarmpit_agent, swarmpit_app and swarmpit_db only; `swarmpit_influxdb` absent; `swarmpit_influx-data` on micro 0. **swarmpit_db:** task `isp4hjomiuzg` on core, `couchdb:2.3.0` digest `ee75c9a737e7`, Running (= `p28_db_task`, `p28_db_node`, `p28_db_digest`); `swarmpit_db-data` on micro 1, on core in use by that task. **swarmpit_agent:** tasks `bju4mnwpbuz3+tcrkflv13cge`, digest `1306e2a2f538` (= Step 0). **swarmpit_app:** task `e3qc53lt51jg` on micro (= `p28_app_taskB`), Running, health `healthy`, FailingStreak 0, RestartCount 0, spec digest `15c044a82fed`; `SWARMPIT_INFLUXDB` env 0, 1.44 pins 2. **thinx_api:** running task `ydaoq586u8v5`, spec digest `f55fa456ca23` (= the Gate B digest; no newer push since), Running since 2026-10-05T11:37:33.399Z; `/api/v2/csrf-token` 200. **thinx_influxdb:** task `lpl1pp201yyi` on core, Running, mounts under `/swarm/swarmpit/` 0. |
| shred | 2026-10-05 12:28 | D-07 dump lifetime ends at phase close (RESEARCH Open Question 5). On micro, `/root/phase28` (dir 700, ext4, so `shred` overwrites in place) held 4 regular files, listed by size only: the swarmpit_db dump (2584 bytes), its `.sha256` (121), `influxdb.conf.A.pre` (372) and `influxdb.conf.bak.20260521200918.A.pre` (188). `shred -u` on each regular file at 12:28:36Z, then `rmdir /root/phase28`; afterwards `test -e /root/phase28` is false. `p28_shred=4`. The conf copies remain as the committed `swarmpit-influxdb.A.pre.conf` and `swarmpit-influxdb-bak-20260521200918.A.pre.conf`. The gluster backups `swarmpit.yml.bak.20261005110213.p28-A-pre` and `swarmpit.yml.bak.20261005112754.p28-B-pre` stay (no secrets). Live `swarmpit.yml` hash `0fd7d2c2de8d` (= `p28_B_post_sha`). |
