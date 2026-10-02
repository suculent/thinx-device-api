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
| push 2 | pending | pending |
| retention install + dry run | pending | pending |
| retention apply + schedule | pending | pending |
| old job retired | pending | pending |
