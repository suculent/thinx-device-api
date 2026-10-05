# Log Paging and Retention Runbook (Phase 26: LOG-01..LOG-04)

> Every command below says where it runs: **on the manager** (either swarm manager; `docker service …`
> works from both), or **on the API node** (the node that currently runs the `thinx_api` task;
> `docker exec` and `docker ps` are node-local). Host names, addresses, keys and ports are not in
> this public repository. See `AGENTS.md` and the operator's `~/.aliases` for access. Service
> placement floats, so look it up every time:
>
> ```bash
> # on the manager
> docker service ps thinx_api --filter desired-state=running --format '{{.Node}} {{.CurrentState}}'
> ```

This runbook covers the production side of Phase 26: the new `_design/paging` views and their
index warm-up, the read-only paging probe, and the retention job that replaces prune-on-read
(D-07) and the broken audit-log retention cron job (D-17). The record of what was actually run
lives in the **Phase 26 Execution Annex** at the end. Everything recorded there is aggregates only:
no owner ids, emails, doc ids, cursors, credentials or paths below an artifact root.

---

## 1. Components

| Component | Where | What it does |
|---|---|---|
| `_design/paging` in `managed_logs` | `design/paging_logs.json` | `audit_by_owner_date` (key `[owner, ISO date]`, string-only flags) for the owner's audit pages; `audit_by_date` (key ISO date, value `_rev`, owner-less docs included) for retention. |
| `_design/paging` in `managed_builds` | `design/paging_builds.json` | `builds_by_owner_time` (key `[owner, time]`, both the flat and the nested `log[0]` shape) for build pages and the GDPR purge; `builds_by_time` (key epoch ms, value `{owner, udid, build_id, rev}`) for retention. |
| Design upsert at boot | `lib/thinx/design_upsert.js`, called from `Database.initDatabase` | Rev-aware, never fatal. Logs one line per DB: `[design-upsert] <db> _design/paging action=<created\|updated\|unchanged\|conflict\|skipped\|timeout>`. `_design/logs` and `_design/builds` are never written (D-13). |
| Paging probe | `scripts/log-paging-probe.js` | Read-only production check of LOG-01..LOG-04. Prints `key=value` aggregates and ends `LOG-PAGING-PROBE OK` or `LOG-PAGING-PROBE FAIL <checks>`. |
| Credential cleanup CLI | `scripts/clear-leaked-credentials.js` | D-15 one-way cleanup of reset keys and credential objects in audit flags. Dry run by default; see the D-15 section (plan 26-06). |
| Retention CLI | `scripts/log-retention.js` | Deletes audit docs and build records older than 365 days plus their build folders on both roots, and orphan build folders. Dry run by default, aggregates only. |
| Retention host wrapper | `scripts/thinx-log-retention.sh`, installed as `/usr/local/sbin/thinx-log-retention.sh` | Runs the retention CLI in a one-shot container from the running API image on `thinx_internal`, with `--memory 256m`, credentials passed by name, read-only mounts except the approved roots, a lock, and a log. |

---

## 2. Index warm-up and timing

CouchDB builds a new view index on the first query after the design doc changes, and `ken` may
start earlier at boot. `managed_logs` has about 4.9k live docs but about 1.3M sequence entries
(657k tombstones), so the first audit index build can take minutes. Warm both indexes right after
Push 1 is up, and before Push 2 ships the Vue UI (D-12).

**Timing rule.** Never run warm-up, probes, retention or any bulk CouchDB work between
**01:00 and 05:00 UTC** (compaction window) or between **06:00 and 07:10 UTC** (`cron.daily` and
`unattended-upgrade`).

Run **on the API node**. The CouchDB credentials expand inside the container, never on the host
command line. The `jq` filters keep counts only; never print rows.

```bash
A=$(docker ps -qf name=thinx_api | head -1)
cget(){ docker exec "$A" sh -c 'curl -sg --max-time 900 "http://$COUCHDB_USER:$COUCHDB_PASS@couchdb:5984/$1"' _ "$1"; }

date -u +%T
cget "_active_tasks" | jq -c '[.[]|select(.type=="indexer")|{db:.database,ddoc:.design_document,changes_done,total_changes,progress}]'
cget "managed_logs/_design/paging/_info"   | jq -c '.view_index|{updater_running,update_seq,sizes}'
cget "managed_builds/_design/paging/_info" | jq -c '.view_index|{updater_running,update_seq,sizes}'

s=$(date +%s); cget "managed_logs/_design/paging/_view/audit_by_owner_date?limit=1"   | jq -c '{total_rows, n:(.rows|length), error}'; echo "audit view answered in $(( $(date +%s)-s ))s"
s=$(date +%s); cget "managed_builds/_design/paging/_view/builds_by_owner_time?limit=1" | jq -c '{total_rows, n:(.rows|length), error}'; echo "builds view answered in $(( $(date +%s)-s ))s"
```

Poll the `_active_tasks` line about every 10 s until no `_design/paging` indexer remains.

**Pass:** both views answer with no `error`; the audit `total_rows` is about the number of audit
docs with an owner (about 4.4k at planning time, plus new writes); the builds `total_rows` is the
number of build docs with an owner (125 at planning time, plus new). A `{"error":"timeout"}` while
the index is still building is not a failure: keep polling `_active_tasks`, then query again.

Record T0 (Push 1 task running), the time each indexer finished, the minutes it took and the
first-query milliseconds in the annex row "index warm-up".

---

## 3. Production paging probe

Run **on the API node**, after the warm-up has finished. The probe only reads, and it pages
(no `_all_docs`, no `skip`), so it is safe inside the API container.

```bash
A=$(docker ps -qf name=thinx_api | head -1)
docker exec "$A" node scripts/log-paging-probe.js
```

**Expected:** the last line is `LOG-PAGING-PROBE OK`. The lines before it are counts and flags
only (design doc state, index `updater_running`, per-kind page counts, totals, order checks,
cross-owner replay, first-page milliseconds). A `LOG-PAGING-PROBE FAIL <checks>` names the failed
check keys; do not ship Push 2 until it is OK and both `index_*_updater_running` are `false`.

No output at all usually means `thinx_api` is not on this node: look up the placement again.

---

## 4. Retention job

### What it deletes

| Store | Deleted | Rule |
|---|---|---|
| `managed_logs` | audit docs dated more than 365 days ago (D-08) | `audit_by_date` with `endkey` = cutoff, exclusive; `_bulk_docs` `_deleted` |
| `managed_builds` | build records whose `start_time` (else `timestamp`) is more than 365 days ago | `builds_by_time`; a record goes only after its folders in every approved root are gone (D-09) |
| deploy root (`/mnt/gluster/thinx/deploy` on the host) | `<owner>/<udid>/<build_id>/` of expired records, and orphans | only when `--roots` names `deploy` |
| repos root (`/mnt/gluster/thinx/repos` on the host) | the same, for build workspaces | only when `--roots` names `repos` |

An **orphan** is a directory exactly three levels below a root whose names are a 64-character
owner id, a UUID and a UUID, that is a real directory (not a symlink), that has no build record,
and whose newest mtime (the directory and its direct children) is older than 365 days (D-11). A
build doc without a numeric time still protects its folder, and is never expired.

Every deletion passes strict name checks and `safepath.resolveInside(root, owner/udid/build_id)`
with an `lstat` directory, at plan time and again immediately before the `rm`. A refused path keeps
its record. A symlink inside a deleted build folder is removed as a link; its target is untouched.

### What it never touches

- udid-level files: `build.json`, `<uuid>.zip`, `firmware.bin`, `basename.json` (OTA reads these);
- owner-level `avatar.json`;
- non-UUID directories at build depth (repo-name dirs), anything at a depth other than 3, and
  anything reached through a symlinked owner or udid directory;
- `_design/*` docs, `managed_users`, `managed_devices`;
- any root not named in `--roots` (the wrapper mounts it read-only).

### Safety rails

- No flags means a **dry run**. `--apply` requires `--roots <deploy|repos|deploy,repos|none>`;
  `none` expires audit docs only. `--no-audit` skips audit expiry.
- A failed record read is `LOG-RETENTION FAIL record_read_failed` and nothing is deleted. Zero
  build rows aborts the orphan sweep (`orphan_sweep=aborted:record_set_empty`), so a CouchDB outage
  never turns every old folder into an orphan.
- Order: folders first, then records. A crash in between leaves a record without a folder, which
  the next run deletes; it never leaves an untracked folder.
- The wrapper exits 1 unless the container exited 0 and printed `LOG-RETENTION DRY-RUN OK` or
  `LOG-RETENTION APPLY OK` as its last line. Empty output is a failure (the old job logged
  "nothing to delete" for a week while it could not reach CouchDB at all).
- **Deletions are one-way (D-09).** There is no backup or snapshot of deleted folders or records.

### Reading the output

| Keys | Meaning |
|---|---|
| `mode`, `cutoff` | `dry-run` or `apply`; the cutoff date (now − 365 days) |
| `audit_expired`, `audit_oldest`, `audit_newest` | expired audit docs and their date range |
| `build_records`, `build_records_expired`, `build_records_invalid_identity`, `build_record_oldest`, `build_record_newest` | all build docs read; expired ones; expired ones without a valid owner/udid/build id (deleted without a folder); their date range |
| `<root>_record_folders`, `<root>_record_bytes`, `<root>_record_missing`, `<root>_refused` | per root: folders of expired records, their size, records with no folder there, paths refused by the gate |
| `<root>_orphans`, `<root>_orphan_bytes`, `<root>_orphan_oldest`, `<root>_orphan_newest` | per root: orphan folders, size, mtime range |
| `orphan_sweep` | `ran` or `aborted:<reason>` |
| apply only: `roots`, `audit`, `audit_deleted`, `audit_conflicts`, `audit_failed`, `build_records_deleted`, `build_records_kept`, `<root>_folders_deleted`, `<root>_orphans_deleted`, `<root>_delete_failed`, `<root>_untracked_after` | what the run changed; `<root>_untracked_after` counts folders of deleted records left in a root that was not approved |
| last line | `LOG-RETENTION DRY-RUN OK`, `LOG-RETENTION APPLY OK`, `LOG-RETENTION APPLY INCOMPLETE` (exit 1, rerun later) or `LOG-RETENTION FAIL <reason>` (exit 1) |

### Install

Run **on the manager**. Take the wrapper from the running API image, so it matches the deployed
job, and check it against the repository file at the pushed commit.

```bash
IMG=$(docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
docker run --rm --entrypoint cat "$IMG" scripts/thinx-log-retention.sh > /tmp/thinx-log-retention.sh
install -o root -g root -m 0755 /tmp/thinx-log-retention.sh /usr/local/sbin/thinx-log-retention.sh
rm /tmp/thinx-log-retention.sh
sha256sum /usr/local/sbin/thinx-log-retention.sh
stat -c '%a %U:%G' /usr/local/sbin/thinx-log-retention.sh     # expect 755 root:root
```

Compare that sha256 with `git show <pushed sha>:scripts/thinx-log-retention.sh | sha256sum` in a
local checkout. They must be equal.

The wrapper reads `COUCHDB_USER` and `COUCHDB_PASS` (or `COUCHDB_PASSWORD`) from the `thinx_api`
service spec and passes them to `docker run` by name only. Its log is
`/var/log/thinx-log-retention.log` and its lock `/var/lock/thinx-log-retention.lock`.

### Dry run

Run **on the manager**:

```bash
/usr/local/sbin/thinx-log-retention.sh
```

Both roots are mounted read-only for a dry run. If the run fails to reach CouchDB (an
`error=…:ENOTFOUND` or `EAI_AGAIN` line before `LOG-RETENTION FAIL audit_read_failed`), the stack
alias `couchdb` does not resolve for a standalone container. Rerun with the service name:

```bash
COUCHDB_HOST=thinx_couchdb /usr/local/sbin/thinx-log-retention.sh
```

and keep that override for the apply and the schedule. The operator approves the scope per root
from the dry-run aggregates (D-10, D-16): all, deploy only, repos only, or audit only.

### Apply (approved roots only)

Map the operator's answer to flags, and run **on the manager**:

| Answer | Flags |
|---|---|
| all | `--apply --roots deploy,repos` |
| deploy only | `--apply --roots deploy` |
| repos only | `--apply --roots repos` |
| audit only | `--apply --roots none` |

```bash
/usr/local/sbin/thinx-log-retention.sh --apply --roots <approved>
/usr/local/sbin/thinx-log-retention.sh            # converged: zero expired audit docs, zero folders and orphans in approved roots
```

Only the approved roots are mounted read-write. `APPLY INCOMPLETE` means some folder or record
could not be deleted; the counts say which kind. Rerun after fixing the cause; a rerun converges.

Before and after the first apply, count the OTA artifacts the job must not touch, and compare:

```bash
find /mnt/gluster/thinx/deploy -mindepth 3 -maxdepth 3 -name build.json -type f | wc -l
find /mnt/gluster/thinx/deploy -mindepth 2 -maxdepth 2 -name avatar.json -type f | wc -l
```

### Schedule

Daily at **09:40 UTC**, clear of 01:00–05:00 UTC and of 06:00–07:10 UTC, when `cron.daily` and
`unattended-upgrade` run. Use `/etc/cron.d`, not `/etc/cron.daily`. Write
`/etc/cron.d/thinx-log-retention` **on the manager** with owner `root:root`, mode `0644`:

```
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Add COUCHDB_HOST=thinx_couchdb here only if the dry run needed it.
40 9 * * * root /usr/local/sbin/thinx-log-retention.sh --apply --roots <approved>
```

```bash
chown root:root /etc/cron.d/thinx-log-retention && chmod 0644 /etc/cron.d/thinx-log-retention
systemctl is-active cron
```

The file holds exactly one schedule line, and its `--roots` value is the approved one.

**Disable:** `rm /etc/cron.d/thinx-log-retention`. The wrapper stays installed for manual runs.

### Retire the old audit retention job

`/usr/local/sbin/couchdb-log-retention.sh` runs from `/etc/cron.daily/couchdb-log-retention`
(through `/etc/crontab`, 06:25 UTC). It calls `curl` inside the hardened CouchDB image, which has
no `curl`, and has deleted nothing since 2026-09-24. Retire it in the same gated step that
schedules the new job, **on the manager**:

```bash
mkdir -p /usr/local/sbin/retired
mv /etc/cron.daily/couchdb-log-retention /usr/local/sbin/retired/couchdb-log-retention.cron
mv /usr/local/sbin/couchdb-log-retention.sh /usr/local/sbin/retired/couchdb-log-retention.sh
```

Both files stay in `/usr/local/sbin/retired/` for reference. **Restore** (only if the new job is
disabled and the old one is wanted back, knowing it does not work against the hardened image):

```bash
mv /usr/local/sbin/retired/couchdb-log-retention.sh /usr/local/sbin/couchdb-log-retention.sh
mv /usr/local/sbin/retired/couchdb-log-retention.cron /etc/cron.daily/couchdb-log-retention
```

---

## D-15 credential cleanup

Before Phase 26, two audit writers (`owner.js` `apply_update` and `sources.js` `updateUser`) passed
the whole user document as the audit `flags` argument, so `managed_logs` holds password hashes,
reset keys, emails and repository lists inside some audit docs. Separately, user documents keep a
`reset_key` after a reset link was issued, and some of those keys were copied into the audit docs
too. Plan 26-03 fixed the writers; this one-time cleanup removes what is already stored.

### What it changes

| Target | Store | Change |
|---|---|---|
| `reset-keys` | `managed_users` | `reset_key` is set to `null` on every user doc that has one, through the `_design/users` `edit` update handler (server side, on the latest revision). Nothing else on the user doc changes. |
| `audit-flags` | `managed_logs` | Only the `flags` field of audit docs whose flags hold a non-string element is rewritten: the string elements are kept, and an empty result falls back to `["info"]`. Message, date, owner and every other field stay as they are. |

Nothing else is written: no design doc, no other database, no file.

### One-way by design

There is **no snapshot and no undo**. A snapshot would store the same password hashes and reset
keys again, which is what the cleanup removes. The record of the run is the aggregate counts in the
annex. Users who were in the middle of a password reset when `reset-keys` ran simply request a new
reset link; the reset flow itself is unchanged.

### Commands

Run **on the API node** (look up the `thinx_api` placement first, as at the top of this runbook).
The script reads `COUCHDB_USER` / `COUCHDB_PASS` from the container environment; no host, address
or credential goes on the command line.

```bash
A=$(docker ps -qf name=thinx_api | head -1)

# Dry run (default): reads managed_users and managed_logs, prints aggregates, writes nothing
docker exec "$A" node scripts/clear-leaked-credentials.js

# Apply, only after the operator approved the targets
docker exec "$A" node scripts/clear-leaked-credentials.js --apply --targets reset-keys,audit-flags
docker exec "$A" node scripts/clear-leaked-credentials.js --apply --targets reset-keys
docker exec "$A" node scripts/clear-leaked-credentials.js --apply --targets audit-flags
```

`--apply` without `--targets`, or `--targets` without `--apply`, is a usage error (exit 2) and
touches nothing.

### Reading the output

| Keys | Meaning |
|---|---|
| `users_scanned`, `users_with_reset_key` | user docs read; those with a non-empty `reset_key` |
| `audit_scanned`, `audit_with_object_flags` | audit docs read; those whose flags hold an object |
| `audit_object_flags_with_password`, `…_with_reset_key`, `…_with_email`, `…_with_repos` | what the affected flags carry (a doc can count in several) |
| `audit_object_flags_oldest`, `audit_object_flags_newest` | date range of the affected audit docs |
| apply only: `users_cleared`, `audit_redacted`, `audit_conflicts`, `audit_failed` | what the run changed or could not change |
| last line | `CLEANUP-DRY-RUN OK`, `CLEANUP-APPLY OK`, `CLEANUP-APPLY INCOMPLETE` (exit 1) or a failure line |

`audit_object_flags_newest` must be older than the start of the first API task that runs the fixed
writers. A newer date means an object-flag writer is still live; stop and find it before applying.

`CLEANUP-APPLY INCOMPLETE` means some docs changed between the scan and the write (conflicts) or
failed. Run the same apply once more; it converges on the docs that are left.

### Zero check after the apply

Run the dry run again. For every target that was applied its count must be zero:
`users_with_reset_key` for reset keys, `audit_with_object_flags` for audit flags. A target that was
not applied keeps its count. Then rerun the paging probe (section 3); it must still end
`LOG-PAGING-PROBE OK` with `legacy_object_flags=0`. The approved targets are recorded once, in the
annex row "D-15 apply".

---

## Phase 26 Execution Annex

Fill each row when the step runs. Aggregates only: counts, sizes, dates, durations, digests and
SHAs. Never owner ids, emails, doc ids, cursors, credentials or paths below an artifact root.

| Step | UTC | Result (aggregates only) |
|---|---|---|
| push 1 | 2026-10-01 19:32:45 | Parent `thinx-staging` pushed `2a9569c1..355b19b7` (47 commits, backend only; `services/console` gitlink unchanged at `c58dd091`). Pre-push: local Phase 26 backend set 250 specs / 0 failures, retention wrapper `node --test` 14 / 0, `secret_hits=0`, no thinx-staging job active. CI for `355b19b7`: `test` (build 15527) success, `api-registry` success (19:36:58), `console-classic-registry` success, `vue-console-registry` success; the `test` log shows ZZ-LogPagingCouchSpec ran (12 specs) inside `989 specs, 0 failures, 1 pending` (the pending one is a pre-existing `xit` in AppSpec). `thinx_api` stop-first rollout on micro, new task started 19:37:16, restarts 0. Image digest before `sha256:c42333a3bb0a`, after `sha256:52d5d082ea1b`. Both console images were rebuilt from the unchanged pin and rolled: `thinx_console` (core) `f6cafcf065bd` → `eb64ebb2789e`, `thinx_vue` (micro) `8457cf023402` → `68001eee952b`. No node repair. |
| design upsert | 2026-10-01 19:37:26 | `managed_builds _design/paging action=created` (19:37:26.426), `managed_logs _design/paging action=created` (19:37:26.514). `action=failed` lines 0, `CRITICAL` lines 0. Before the push both `_design/paging` docs were absent (HTTP 404) and `_design/logs` was rev gen 1; managed_builds `doc_del_count` 0. |
| index warm-up | 2026-10-01 19:37:26–19:39:39 | T0 = 19:37:26 (boot upsert). managed_logs: two shard indexers, 63 % at 19:38:35, 95 % at 19:39:07, gone by 19:39:23, `updater_running=false` at 19:39:39, about 2 min (331k changes per shard, tombstones included). managed_builds: already idle at the first poll (19:38:35), under 1.2 min. First `limit=1` query, including about 136 ms of `docker exec` overhead: `audit_by_owner_date` 184 ms (total_rows 4467), `audit_by_date` 302 ms (4967), `builds_by_owner_time` 196 ms (126), `builds_by_time` 195 ms (126), no `error`. `owner-keyed audit view unavailable` lines between T0 and T_done: 0. Both windows (01:00–05:00, 06:25–07:10) avoided. |
| paging probe | 2026-10-01 19:40:01 | `ddoc_paging_logs=ok ddoc_paging_builds=ok ddoc_logs_rev_gen=1 ddoc_logs_map_sha12=41de3686cde2 index_logs_updater_running=false index_builds_updater_running=false audit_owners=266 legacy_len=200 legacy_expected=200 legacy_match=1 legacy_object_flags=0 legacy_fallback_used=0 audit_pages=15 audit_total=1489 audit_expected=1489 audit_dupes=0 audit_order_ok=1 audit_foreign=0 audit_cursor_owner_free=1 audit_first_page_ms=101 replay_rows=100 replay_foreign=0 build_owners=4 build_pages=2 build_total=117 build_expected=117 build_dupes=0 build_order_ok=1 build_foreign=0 build_nested=110 build_first_page_ms=1004 builds_del_before=0 builds_del_after=0`, last line `LOG-PAGING-PROBE OK`. The map sha12 `41de3686cde2` is sha256 of the exact `logs_by_owner` map string, the same as the repository's `design/design_logs.json`. The planned value `925f3cee0cc4` is the same string with a trailing newline (measured with `jq -r … \| sha256sum`). Rev gen 1 shows `_design/logs` was never rewritten (D-13). |
| D-15 dry run | 2026-10-01 19:40:58 | `users_scanned=662 users_with_reset_key=44 audit_scanned=4967 audit_with_object_flags=197 audit_object_flags_with_password=88 audit_object_flags_with_reset_key=103 audit_object_flags_with_email=164 audit_object_flags_with_repos=197 audit_object_flags_oldest=2025-10-01 audit_object_flags_newest=2026-10-01T15:38Z`, last line `CLEANUP-DRY-RUN OK`. The newest affected audit doc predates the Push 1 task start (19:37:16), so the fixed writers are live. Nothing written. |
| D-15 apply | 2026-10-02 11:15:49–11:16:40 | Operator answer `apply-both`, so `d15_targets=reset-keys,audit-flags`. Precheck 11:15: `thinx_api` still on micro, digest `52d5d082ea1b`, same task (started 2026-10-01 19:37:16, restarts 0). Fresh dry run 11:15:23 (the run resumed the next day): `users_scanned=663 users_with_reset_key=44 audit_scanned=4975 audit_with_object_flags=197 audit_object_flags_with_password=88 audit_object_flags_with_reset_key=103 audit_object_flags_with_email=164 audit_object_flags_with_repos=197 audit_object_flags_newest=2026-10-01T15:38Z`. The newest affected doc still predates Push 1, and none of the 8 audit docs written since is affected. Apply, run once with `--apply --targets reset-keys,audit-flags`: `users_cleared=44 users_failed=0 audit_redacted=197 audit_conflicts=0 audit_failed=0`, last line `CLEANUP-APPLY OK`, no rerun. Post-apply dry run 11:17:27: `users_scanned=663 users_with_reset_key=0 audit_scanned=4975 audit_with_object_flags=0` (all four breakdowns 0, oldest/newest `none`), `CLEANUP-DRY-RUN OK`, D15-POST-DRYRUN-CLEAN passed. Probe 11:17:50: `ddoc_logs_rev_gen=1 ddoc_logs_map_sha12=41de3686cde2 legacy_match=1 legacy_object_flags=0 legacy_fallback_used=0 audit_total=1489 audit_expected=1489 audit_foreign=0 replay_foreign=0 build_total=117 build_expected=117 build_nested=110 builds_del_after=0`, last line `LOG-PAGING-PROBE OK` (PROBE-OK-AFTER-D15). |
| push 2 readiness | 2026-10-02 11:21:46–11:24:34 | Read-only rehearsal, nothing pushed. Vue unit `test:unit` exit 0, 50 `ok` / 0 `not ok` (VUE-UNIT-GREEN). Scoped stubbed Cypress (history, dashboard, device-detail only, local dev server :3000): 15 + 8 + 7 = 30 / 30 passing, "All specs passed!", exit 0, no proxy errors, dev server and Cypress stopped afterwards (VUE-CYPRESS-GREEN). Production-mode `npm --prefix services/console/vue run build` exit 0; "Load more audit log entries" and "Load more builds" each in 2 of 4 files under `dist/js/` (the modern and legacy `app` chunks) (BUNDLE-HAS-PAGING). Production probe at 11:24:34 on micro (`thinx_api` digest `52d5d082ea1b`, the Push 1 task started 2026-10-01 19:37:16, restarts 0): `index_logs_updater_running=false index_builds_updater_running=false audit_first_page_ms=99 build_first_page_ms=306`, plus `ddoc_logs_rev_gen=1 ddoc_logs_map_sha12=41de3686cde2 legacy_match=1 legacy_object_flags=0 audit_total=1489 audit_expected=1489 audit_foreign=0 replay_foreign=0 build_total=117 build_expected=117 build_nested=110 builds_del_after=0`, last line `LOG-PAGING-PROBE OK` (LIVE-PAGING-FAST). Running digests: `thinx_vue` `68001eee952b` (micro), `thinx_console` `eb64ebb2789e` (core). Outgoing: console `c58dd09..3e77525` (8 signed commits, 14 files, all under `vue/`), fast-forward; parent `355b19b7..` (unpushed docs commits only), fast-forward. No thinx-staging CI job running. |
| push 2 | 2026-10-02 11:32:52–11:41:14 | Operator answer `push`. Pre-push: no thinx-staging job active, `secret_hits=0` across both outgoing diffs, running digests `thinx_api` `52d5d082ea1b` (micro), `thinx_vue` `68001eee952b` (micro), `thinx_console` `eb64ebb2789e` (core); `_design/paging` rev gen 1 in managed_logs and 1 in managed_builds, `_design/logs` rev gen 1. Console `thinx-staging` pushed `c58dd09..3e77525` (fast-forward, 8 signed commits, `vue/` only). Signed gitlink bump `a1d65e0a`; parent `thinx-staging` pushed `355b19b7..a1d65e0a` at 11:33:32 (5 commits: 4 docs + the bump). CI for `a1d65e0a`: `test` (build 15538) success, log `989 specs, 0 failures, 1 pending spec`; `console-classic-registry` (15532) success 11:35:44; `vue-console-registry` (15536) success 11:38:09; `api-registry` (15539) success 11:38:12. Rollout, no node repair: `thinx_console` (core) `eb64ebb2789e` → `bb889884d093`, `thinx_vue` (micro) `68001eee952b` → `3030138fc15b`, `thinx_api` (micro, stop-first) `52d5d082ea1b` → `fbe53daf0a03`, new task started 11:39:59, restarts 0, update `completed`. Served `https://console.thinx.cloud/js/app.js` (cache-busted): "Load more audit log entries" 1, "Load more builds" 1 (VUE-PAGING-SERVED). Boot upsert 11:40:16: `managed_builds` and `managed_logs` `_design/paging action=unchanged` (2), created/updated/failed 0, `CRITICAL` 0. After the restart `_design/paging` is still rev gen 1 in both DBs, equal to the pre-push values, so nothing was rewritten or re-indexed (LOG-01 idempotency). Probe 11:41:14: `ddoc_logs_rev_gen=1 ddoc_logs_map_sha12=41de3686cde2 index_logs_updater_running=false index_builds_updater_running=false legacy_match=1 legacy_object_flags=0 legacy_fallback_used=0 audit_pages=15 audit_total=1489 audit_expected=1489 audit_dupes=0 audit_foreign=0 audit_cursor_owner_free=1 audit_first_page_ms=214 replay_foreign=0 build_pages=2 build_total=117 build_expected=117 build_dupes=0 build_nested=110 build_first_page_ms=712 builds_del_after=0`, last line `LOG-PAGING-PROBE OK`. |
| retention install + dry run | 2026-10-02 11:46:57–11:53:28 | Precondition: `thinx_api` on micro, digest `fbe53daf0a03` (the Push 2 task), the running container has `scripts/log-retention.js`, 11:46 UTC. Before the install, `/usr/local/sbin/thinx-log-retention.sh`, `/etc/cron.d/thinx-log-retention` and `/etc/cron.daily/thinx-log-retention` were all absent. Install 11:47: the repository file was streamed over ssh stdin to `.new`, set to `root:root 0755` and moved into place with `mv -f`. Its sha256 matches the local file, the copy inside the running image and `a1d65e0a:scripts/thinx-log-retention.sh` (WRAPPER-INSTALLED-MATCH, `mode_owner=755 root`). **Old job:** `/etc/cron.daily/couchdb-log-retention` present (755 root:root), `/usr/local/sbin/couchdb-log-retention.sh` present, cron.daily runs from `/etc/crontab` at 06:25. Its log has 489 lines and 9 `nothing to delete (resp head: )` lines, one a day from 2026-09-24 to 2026-10-02. **OTA baseline** 11:47:42: `ota_baseline_build_json=2` (udid-level `build.json`, depth 3) and `ota_baseline_avatars=6` (owner-level `avatar.json`, depth 2). **Ownership** (depth-limited, counts only): every directory at depths 1–3 is uid 0. That is 227 / 7 / 24 directories in deploy and 9 / 20 / 187 in repos, with both roots `0:0`. The image user is `0` and the service spec sets none, so the one-shot container runs as root. The dry run cannot prove deletion rights on gluster; an apply would report `<root>_delete_failed` if root is squashed. **Slots in use** (minute and hour fields only): `/etc/crontab` :17 hourly, 06:25 daily (cron.daily), 06:47 Sundays, 06:52 on the 1st. `cron.d`: 17:09 daily and 01:01 on the 1st (clean_docker), 03:10 daily and 03:30 Sundays (e2scrub_all), 06:25 daily (ntpsec), :05–:55 every 10 min and 23:59 (sysstat). User crontabs: one every minute (monitoring agent) and 03:00 on the 1st. `apt-daily-upgrade.timer` `OnCalendar=*-*-* 6:00`, `RandomizedDelaySec=60m`; `apt-daily.timer` `6,18:00`, `12h`. Host TZ is UTC. Nothing else is at 09:40, so the planned slot is free. **Host value:** the default `COUCHDB_HOST=couchdb` worked: the stack alias resolves from a standalone container on `thinx_internal` (attachable overlay), which closes research A7. No override is needed. **Dry run** (`--dry-run`, roots mounted read-only, 11:48:36–11:53:28, about 5 min, the container peaked near 36 MiB of its 256 MiB cap): `mode=dry-run cutoff=2025-10-02 audit_expired=51 audit_oldest=2025-09-23 audit_newest=2025-10-02 build_records=126 build_records_expired=103 build_records_invalid_identity=0 build_record_oldest=2023-02-20 build_record_newest=2024-10-26 deploy_record_folders=4 deploy_record_bytes=27036 deploy_record_missing=99 deploy_refused=0 deploy_orphans=0 deploy_orphan_bytes=0 deploy_orphan_oldest=none deploy_orphan_newest=none repos_record_folders=103 repos_record_bytes=25853925 repos_record_missing=0 repos_refused=0 repos_orphans=61 repos_orphan_bytes=211535430 repos_orphan_oldest=2021-07-02 repos_orphan_newest=2022-05-15 orphan_sweep=ran`, last line `LOG-RETENTION DRY-RUN OK`, wrapper exit 0. The output has no 64-hex string, UUID, `@` or path. The bytes are apparent sizes: deploy about 26 KiB, repos record folders about 24.7 MiB, repos orphans about 201.7 MiB. The host log `/var/log/thinx-log-retention.log` is 644 root:root with no 64-hex string and no path. The verify gate reran the dry run at 11:53:47–11:55:49 (about 2 min, warm caches). Its 28 aggregate lines are identical to the first run's, and the gate passed (RETENTION-DRYRUN-PROD-OK). WRAPPER-INSTALLED-MATCH, `no_schedule_yet=1` with `old_job_present=1`, and OTA-BASELINE-RECORDED also passed. Nothing was deleted or scheduled, and the old job is untouched. |
| retention apply + schedule | 2026-10-02 11:58:35–12:07:44 | Operator answer `all`, so `approved_roots=deploy,repos` and the flags are `--apply --roots deploy,repos` (audit on). No `COUCHDB_HOST` override, as in the dry run. Before the run: 11:58 UTC (outside 01:00–05:00 and 06:00–07:10), no wrapper process running. **Apply** (one-shot container from the running `thinx_api` image, only deploy and repos mounted read-write, 11:58:35–12:06:15, about 7.7 min, peak about 34 MiB of its 256 MiB cap), single run, no retry needed: the scan matched the dry run exactly (`audit_expired=51 build_records=126 build_records_expired=103 build_records_invalid_identity=0 deploy_record_folders=4 deploy_record_bytes=27036 deploy_record_missing=99 deploy_refused=0 deploy_orphans=0 repos_record_folders=103 repos_record_bytes=25853925 repos_record_missing=0 repos_refused=0 repos_orphans=61 repos_orphan_bytes=211535430 orphan_sweep=ran`), then `roots=deploy,repos audit=on audit_deleted=51 audit_conflicts=0 audit_failed=0 build_records_deleted=103 build_records_kept=0 deploy_folders_deleted=4 deploy_orphans_deleted=0 deploy_delete_failed=0 deploy_untracked_after=0 repos_folders_deleted=103 repos_orphans_deleted=61 repos_delete_failed=0 repos_untracked_after=0`, last line `LOG-RETENTION APPLY OK`, wrapper exit 0. Root inside the container could delete on gluster (no squash). Reclaimed about 26 KiB in deploy and about 226.4 MiB in repos (apparent sizes). The output has no 64-hex string, UUID, `@` or path. **Convergence** dry run 12:06:43–12:06:50: `audit_expired=0 build_records=23 build_records_expired=0 build_records_invalid_identity=0 deploy_record_folders=0 deploy_refused=0 deploy_orphans=0 repos_record_folders=0 repos_refused=0 repos_orphans=0 orphan_sweep=ran`, last line `LOG-RETENTION DRY-RUN OK`, so `build_records_expired` equals refused plus invalid identity (0) (RETENTION-CONVERGED). **OTA guard** 12:06:58: `ota_build_json=2 owner_avatars=6`, equal to the Task 1 baseline (OTA-BASELINE-EQUAL). **Schedule** 12:07:13: `/etc/cron.d/thinx-log-retention` written to `.new`, set to `root:root 0644` and moved into place. It holds a Phase 26 comment line, `SHELL=/bin/sh`, `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` and one schedule line, `40 9 * * * root /usr/local/sbin/thinx-log-retention.sh --apply --roots deploy,repos` (09:40 UTC, the planned slot, free per the dry-run row). Nothing was created under `/etc/cron.daily`; `cron` is active. This cron does not log a reload line for `cron.d`, so the first scheduled run (2026-10-03 09:40 UTC) is the confirmation that it was picked up. The host log `/var/log/thinx-log-retention.log` (644 root:root, 131 lines, one `LOG-RETENTION APPLY OK`) has no 64-hex string, path, UUID or `@`. SCHEDULE-AND-RETIREMENT-OK passed at 12:07:44 with `schedule_utc=9:40`. |
| old job retired | 2026-10-02 12:07:27 | `mkdir -p /usr/local/sbin/retired` (755 root:root). `/etc/cron.daily/couchdb-log-retention` moved to `/usr/local/sbin/retired/couchdb-log-retention.cron`, and `/usr/local/sbin/couchdb-log-retention.sh` moved to `/usr/local/sbin/retired/couchdb-log-retention.sh` (both 755 root:root, kept for reference, nothing deleted). `/etc/cron.daily/couchdb-log-retention` is absent, and `/etc/crontab` and `/etc/cron.d/*` no longer reference it. Its old log `/var/log/couchdb-log-retention.log` and lock file were left in place. To restore it, move the `.cron` file back to `/etc/cron.daily/couchdb-log-retention` and the script back to `/usr/local/sbin/` (it deletes nothing anyway). |

---

*Phase 26 production work completed 2026-10-02: paging views live, Vue paging UI deployed, D-15 cleanup applied, and the retention job scheduled daily at 09:40 UTC with roots `deploy,repos`. The broken audit cron job is retired.*
