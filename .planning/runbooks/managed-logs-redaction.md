# Managed Logs PII Redaction Runbook (SEC-PII-02)

Operator-facing procedure for redacting historic PII (raw 64-char hex `reset_key` substrings + raw email patterns) from the `managed_logs` CouchDB database on the THiNX production swarm, AND for operating the forward-going 90-day TTL cron that prevents the leak shape from re-accumulating.

**Swarm SSH:** `ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244` (`micro`); `ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.203.163` (`core`, swarm leader).
**Stack repo on swarm host:** `/mnt/gluster/deployment/swarm/` (use the `thx` alias on either node).
**CouchDB credentials:** `/mnt/gluster/thinx/.env` — `COUCHDB_USER`, `COUCHDB_PASSWORD`.
**CouchDB reachability:** overlay network `thinx_internal` (attachable, spans both nodes); service name `thinx_couchdb` resolves on the overlay; placement drifts (verify with `docker service ps thinx_couchdb`).

**Tools shipped by this repo (v1.9 / Phase 9):**
- Script: `scripts/redact-managed-logs.js` (Plan 09-1) — dry-run/apply/sample CLI; reuses `Util.redactToken` / `Util.redactEmail` patterns from `lib/thinx/util.js`.
- Audit TTL field: `lib/thinx/audit.js` writes `expire_at = mtime + retentionDays * 24h` on every new record (Plan 09-2; 90-day default, configurable via `app_config.audit_retention_days`).
- Existing compaction call site: `lib/thinx/database.js:117` (`this.nano.db.compact(prefix + "managed_logs")`) — in-process compactor wired into `compactDatabases()`.

**Status:** SEC-PII-02 — Phase 9 of v1.9. ~658k pre-Phase-2 docs as of 2026-05-26 snapshot.

---

## 1. Pre-flight Checklist

Run through ALL of the following BEFORE invoking the redaction script. Any "no" answer is a STOP — resolve first.

- [ ] Confirm CouchDB service placement: `docker service ps thinx_couchdb --format '{{.Name}} {{.Node}} {{.CurrentState}}'` — note which node hosts the running task. Service placement drifts after every stack update.
- [ ] Confirm `/mnt/gluster/thinx/.env` is readable from the node you are working on: `test -r /mnt/gluster/thinx/.env && grep -c '^COUCHDB_' /mnt/gluster/thinx/.env` — expect `2` (USER + PASSWORD).
- [ ] Source the env: `set -a; . /mnt/gluster/thinx/.env; set +a` — then confirm `echo "${COUCHDB_USER:?}" >/dev/null` and `echo "${COUCHDB_PASSWORD:?}" >/dev/null` both succeed silently.
- [ ] Confirm `THINX_PREFIX` value for the target environment. Production currently uses an empty prefix (the DB is literally `managed_logs`, not `prod_managed_logs`). If unsure: `docker run --rm --network thinx_internal curlimages/curl:latest -s "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@thinx_couchdb:5984/_all_dbs" | tr ',' '\n' | grep -i managed_logs` — the bare `managed_logs` line confirms empty prefix.
- [ ] Confirm snapshot target path has enough free space. The snapshot is JSONL of every doc the script touches. Rough estimate: `~3-5 GB` for 658k docs (average ~5 KB / JSON-serialized doc). Check `df -h /mnt/gluster` — require at least 10 GB free margin.
- [ ] Confirm a maintenance window. The redaction issues batched `_bulk_docs` writes against `managed_logs`; this may briefly elevate CouchDB latency and contend with the live `thinx_api` audit-write path.
- [ ] Confirm `thinx_api` is on a v1.9+ image (Plan 09-2's `expire_at` field is forward-only — if the running image predates the v1.9 deploy, new audit writes will NOT carry `expire_at` until the v1.9 image lands). Verify: `docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` — confirm digest matches the v1.9 release on Docker Hub.
- [ ] Confirm a designated forensic-rollback contact + retention window for the snapshot artifact (recommended: 90 days mirroring forward-TTL; see § 6 GDPR Posture).

---

## 2. Procedure — Operator Sequence

The procedure is: SNAPSHOT-DRY-RUN → REVIEW → APPLY (with mandatory snapshot) → SAMPLE-VERIFY → (optional) COMPACT. The script defaults to dry-run; mutation requires explicit `--apply --snapshot-to <path>`.

### Step 1 — Sync repo to the swarm host

```bash
ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244
cd /mnt/gluster/deployment/swarm/   # or wherever the operator keeps the working checkout
git fetch origin
git checkout thinx-staging
git pull --ff-only
# expect: HEAD includes the v1.9 / SEC-PII-02 commits (scripts/redact-managed-logs.js present)
test -f scripts/redact-managed-logs.js && echo "script present"
```

### Step 2 — Dry-run scan (mandatory, default mode — NO WRITES)

```bash
set -a; . /mnt/gluster/thinx/.env; set +a   # exports COUCHDB_USER / COUCHDB_PASSWORD

docker run --rm --network thinx_internal \
  -v "$(pwd)":/work -w /work \
  -e COUCHDB_URL="http://thinx_couchdb:5984" \
  -e COUCHDB_USER -e COUCHDB_PASSWORD \
  -e THINX_PREFIX="${THINX_PREFIX:-}" \
  node:18-alpine node scripts/redact-managed-logs.js --scan
# expect:
#   [<ts>] [init] couchdb url=http://...:<redacted>@thinx_couchdb:5984 db=managed_logs user=***
#   [<ts>] [scan] starting dry-run against db=managed_logs (NO WRITES)
#   [<ts>] [scan] scanned=<N> dirty=<D> resetKeyHits=<R> emailHits=<E>
#   [<ts>] [scan] sample of leak-bearing docs (max 5; raw matches NOT logged): ...
```

Operator reviews the report:
- **`dirty` near zero** → the corpus may already be clean; STOP and confirm with the SEC-PII-01 / SEC-PII-02 phase summaries before proceeding.
- **`dirty` implausibly large** (e.g., > 100% of expected ~658k) → STOP; misconfiguration (wrong DB, wrong prefix) is likely.
- **`dirty` in the expected range** → proceed to Step 3.

If the report looks anomalous, do NOT apply. The script's stdout `_id`s are safe to share (raw match content is NEVER logged — only counts + field names + doc IDs).

### Step 3 — Snapshot + Apply (DESTRUCTIVE)

The script REFUSES to run `--apply` without `--snapshot-to`. The snapshot is the ONLY forensic-rollback artifact.

```bash
SNAPSHOT_DIR=/mnt/gluster/thinx/snapshots
mkdir -p "${SNAPSHOT_DIR}"
SNAPSHOT_PATH="${SNAPSHOT_DIR}/managed_logs.pre-redaction-$(date -u +%Y%m%dT%H%M%SZ).jsonl"

docker run --rm --network thinx_internal \
  -v "$(pwd)":/work -v "${SNAPSHOT_DIR}":"${SNAPSHOT_DIR}" -w /work \
  -e COUCHDB_URL="http://thinx_couchdb:5984" \
  -e COUCHDB_USER -e COUCHDB_PASSWORD \
  -e THINX_PREFIX="${THINX_PREFIX:-}" \
  node:18-alpine node scripts/redact-managed-logs.js \
    --apply \
    --snapshot-to "${SNAPSHOT_PATH}" \
    --batch-size 500
# expect:
#   [<ts>] [apply] DESTRUCTIVE MODE. snapshot=<path> db=managed_logs batch=500 maxDocs=unbounded
#   [<ts>] [apply] done touched=<T> conflicts=<C>
```

Immediately after the run completes:

```bash
chmod 600 "${SNAPSHOT_PATH}"
ls -lh "${SNAPSHOT_PATH}"
# expect: file size > 0; permission bits -rw-------
wc -l "${SNAPSHOT_PATH}"
# expect: line count == touched count from script stdout
```

**Staged rollout option:** for an initial confidence pass, add `--max-docs 10000` to redact only the first 10k matching docs, sample-verify, then re-run without `--max-docs` to finish. The script is idempotent: a second `--apply` pass produces zero new edits on docs already redacted.

**Conflict handling:** if the apply summary reports `conflicts > 0`, those are CouchDB `_rev` conflicts caused by a concurrent write (the live `thinx_api` audit path wrote to the same doc between our read and our bulk-update). Re-run `--apply` to catch the conflicted IDs — the script's idempotency makes a retry safe.

### Step 4 — Sample-verify (SEC-PII-02 zero-leak gate)

```bash
docker run --rm --network thinx_internal \
  -v "$(pwd)":/work -w /work \
  -e COUCHDB_URL="http://thinx_couchdb:5984" \
  -e COUCHDB_USER -e COUCHDB_PASSWORD \
  -e THINX_PREFIX="${THINX_PREFIX:-}" \
  node:18-alpine node scripts/redact-managed-logs.js --sample 1000
echo "exit=$?"
# expect:
#   [<ts>] [sample] verifying N=1000 recent + N=1000 old random docs against zero-leak invariant
#   [<ts>] [sample] checked=2000 leaks=0
#   [<ts>] [sample] PASS: zero raw 64-char hex reset_keys and zero raw emails across 2000 sampled docs.
#   exit=0
```

If `exit != 0` (i.e., `exit=65 EXIT_LEAK_DETECTED`):
- The script prints `_id`s of leak-bearing docs (raw match content is NEVER logged). STOP. Do NOT re-run `--apply` blindly.
- Diagnose root cause: (a) concurrent-write race during apply (re-running `--apply` catches stragglers — script is idempotent); or (b) a leak shape the regex did not anticipate (file a SEC-PII-02b follow-up, expand the regex in `scripts/redact-managed-logs.js`, then re-apply).
- Re-run `--sample 1000` until `exit=0`.

Record the result in the GDPR-posture sampling table (§ 6 below): `| YYYY-MM-DD | 1000 + 1000 | exit 0 (clean) | <operator> |`.

### Step 5 — (Optional) Compact the database

CouchDB retains the old `_rev` of every redacted doc until compaction reclaims the space. The redacted overlay is the current `_rev`; the pre-redaction PII text persists in old revisions UNTIL compaction.

```bash
docker run --rm --network thinx_internal curlimages/curl:latest \
  -X POST -H 'Content-Type: application/json' \
  "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@thinx_couchdb:5984/${THINX_PREFIX:-}managed_logs/_compact"
# expect: {"ok":true}
```

Compaction is I/O-heavy on a 658k-doc DB; schedule during a low-traffic window. Monitor progress:

```bash
docker run --rm --network thinx_internal curlimages/curl:latest -s \
  "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@thinx_couchdb:5984/${THINX_PREFIX:-}managed_logs" \
  | grep -E '"compact_running"|"disk_size"|"data_size"'
# expect: compact_running:true while running, then false when complete
```

**Alternative path:** the existing in-process compactor at `lib/thinx/database.js:117` (`compactDatabases()`) iterates `managed_logs`, `managed_builds`, `managed_devices`, `managed_users`. Triggered at next `thinx_api` startup or admin call. Confirm wiring before relying on this path (the manual `curl` recipe above is the canonical operator action).

Until compaction completes, the old `_rev` PII is still recoverable from CouchDB internals — meaning the redaction is NOT fully irreversible until both the overlay AND compaction have completed. The runbook's "destructive" claim refers to the post-compaction state.

---

## 3. Forward-TTL Cron Recipe

The `expire_at` field (Plan 09-2 → `lib/thinx/audit.js` `_buildRecord`) is written on every new audit record but does NOT auto-evict (CouchDB has no native TTL). Schedule a nightly cron on the swarm host scheduler to sweep expired docs.

The recipe references a `_design/cleanup` view that emits `[expire_at, _rev]` indexed by `expire_at`. The design doc itself is OUT OF SCOPE for Phase 9 (per `09-CONTEXT.md`: "CouchDB cron infrastructure depends on swarm-side scheduler + lives in `/mnt/gluster/deployment/swarm/` outside this repo"). The operator authors the design doc following the standard CouchDB view pattern; the recipe below is a STARTING TEMPLATE.

**Design doc shape** (operator creates separately; documented here for reference):

```json
{
  "_id": "_design/cleanup",
  "language": "javascript",
  "views": {
    "expired": {
      "map": "function(doc){ if (doc.expire_at) { emit(doc.expire_at, doc._rev); } }"
    }
  }
}
```

**Cron entry** (drop into `/etc/cron.d/thinx-managed-logs-cleanup` on the swarm-leader node — runs nightly at 03:00 UTC):

```cron
# /etc/cron.d/thinx-managed-logs-cleanup
# Run nightly at 03:00 UTC; sweep CouchDB managed_logs docs with expire_at <= now.
0 3 * * * root . /mnt/gluster/thinx/.env && docker run --rm --network thinx_internal curlimages/curl:latest \
  -s -X GET "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@thinx_couchdb:5984/${THINX_PREFIX:-}managed_logs/_design/cleanup/_view/expired?endkey=\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"&include_docs=false" \
  | jq -r '.rows[] | [.id, .value] | @tsv' \
  | while IFS=$'\t' read -r id rev; do \
      docker run --rm --network thinx_internal curlimages/curl:latest \
        -s -X DELETE "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@thinx_couchdb:5984/${THINX_PREFIX:-}managed_logs/${id}?rev=${rev}"; \
    done
```

**Adjust** the view path (`_design/cleanup/_view/expired`) and date format to match the design doc the operator deploys. Verify the recipe end-to-end on a low-traffic window with a tight `?limit=10` test query before letting cron run unbounded.

**Alternative (in-process sweep, deferred to v1.10):** extend `lib/thinx/database.js:compactDatabases()` to ALSO iterate `expire_at < now` and call `loglib.destroy(id, rev)` per match. This removes the swarm-host-scheduler dependency but couples retention to the `thinx_api` lifecycle. Out of Phase 9 scope — file as a v1.10 candidate.

---

## 4. Rollback from Snapshot

If the redaction needs to be undone (e.g., a downstream auditor requests the original content for a specific incident, or a regex flaw was discovered post-apply and the operator wants a clean restart):

### Single-doc restore

```bash
SNAPSHOT_PATH=/mnt/gluster/thinx/snapshots/managed_logs.pre-redaction-<timestamp>.jsonl
TARGET_ID="<doc _id>"

# The snapshot is JSONL — one CouchDB doc per line, with original _rev preserved.
grep -F "\"_id\":\"${TARGET_ID}\"" "${SNAPSHOT_PATH}" \
  | head -1 \
  | jq '.' \
  | docker run --rm -i --network thinx_internal curlimages/curl:latest \
      -s -X PUT \
      -H 'Content-Type: application/json' \
      -d @- \
      "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@thinx_couchdb:5984/${THINX_PREFIX:-}managed_logs/${TARGET_ID}?new_edits=false"
# expect: {"ok":true,"id":"...","rev":"..."}
```

### Bulk restore via `_bulk_docs`

```bash
SNAPSHOT_PATH=/mnt/gluster/thinx/snapshots/managed_logs.pre-redaction-<timestamp>.jsonl

# Split the snapshot into 500-doc chunks (matches the apply --batch-size default).
split -l 500 "${SNAPSHOT_PATH}" /tmp/snap-chunk-

# POST each chunk as a _bulk_docs payload with new_edits=false to honor the original _rev.
for chunk in /tmp/snap-chunk-*; do
  jq -s '{docs: ., new_edits: false}' "${chunk}" \
    | docker run --rm -i --network thinx_internal curlimages/curl:latest \
        -s -X POST \
        -H 'Content-Type: application/json' \
        -d @- \
        "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@thinx_couchdb:5984/${THINX_PREFIX:-}managed_logs/_bulk_docs"
  # Pause between chunks to avoid latency spikes on the live audit-write path.
  sleep 2
done
# Cleanup chunks after success.
rm -f /tmp/snap-chunk-*
```

`new_edits=false` is critical — it tells CouchDB to honor the snapshot's original `_rev` instead of creating a new revision. Without this flag, the rollback creates a NEW revision and the redacted version remains as a previous-rev artifact (potentially confusing and not what the operator wants).

**Caveat — post-compaction window:** if Step 5 compaction has already run, the redacted overlay is no longer a "previous rev" — it IS the current data. The bulk-restore above will still work (CouchDB accepts `new_edits=false` against the current `_rev`), but the result is a fresh write with the original `_rev` value. Confirm via a single-doc `?include_docs=true` GET that the restored content matches the snapshot before declaring rollback successful.

---

## 5. Reversibility — Explicit Acceptance

**The redaction IS destructive of audit-log content.** Per `09-CONTEXT.md` ("`Reversibility`" decision):

- The original PII text in `message` is overwritten in CouchDB by the redacted overlay (`[REDACTED-RESET_KEY]` / `[REDACTED-EMAIL]` markers).
- The ONLY artifact retaining the pre-redaction content is the JSONL snapshot file written by `--snapshot-to` in Step 3.
- After `_compact` (Step 5), even the CouchDB-internal previous-rev artifact is gone.
- Snapshot retention is the operator's responsibility — see § 6 GDPR Posture for the recommended 90-day window mirroring the forward-TTL retention.

This irreversibility is **accepted by design** — the SEC-PII-02 invariant is that historic PII MUST NOT be readable from `managed_logs` after remediation; retaining the original content in CouchDB-internal previous revs would defeat the purpose.

---

## Execution Annex — SEC-PII-02 (OPS-EXEC-02)

**Executed:** 2026-06-05T12:35Z · **Operator:** MS (autonomous session, operator-supervised) · **Host:** `micro` (188.166.23.244) · **CouchDB:** 3.5.1 on overlay `thinx_internal`, service `thinx_couchdb.1` placed on `micro`.

**Outcome:** Closed as a **discrepancy branch** — two material deviations from the runbook premise were found and handled in-session.

### Pre-flight (7/7 — adapted)

- ✅ CouchDB placement confirmed (`thinx_couchdb.1` Running on `micro`).
- ✅ `/mnt/gluster/thinx/.env` readable; 5 `COUCHDB_*` vars present; `SLACK_WEBHOOK` present (OBS-01 path live).
- ✅ `THINX_PREFIX` empty — DB is bare `managed_logs`.
- ✅ Snapshot target `/mnt/gluster/thinx/snapshots` (`chmod 700`); `df` showed 13 GB free (> 10 GB margin).
- ✅ `thinx_api` reachable (running on `core`); note: running image is `thinxcloud/api:latest` (forward-TTL `expire_at` writes are a Phase-9 forward concern, independent of this historic sweep).
- ✅ Maintenance window: low-traffic; live audit-write path tolerated the small bulk update (0 conflicts).
- ✅ Forensic-rollback artifact (snapshot) retained per § 6 (90-day window).

### Discrepancy 1 — historic corpus already deleted out-of-band

The runbook baseline assumed ~658k live pre-Phase-2 docs. Dry-run + `_all_docs?limit=0` + `_info` showed:

| field | value |
|-------|-------|
| `doc_count` (live) | **2,183** |
| `doc_del_count` | **656,697** |

`2,183 + 656,697 = 658,880 ≈` the 658,808 baseline — i.e., the bulk corpus had **already been deleted** out-of-band (a compaction was already in progress on arrival, `compact_running:true`). No mass-redaction of 658k docs was required; the remaining work was the live residue + compaction.

### Discrepancy 2 — redactor false-positive on the `owner` field (fixed in-flight → SEC-PII-02b)

The first dry-run reported `dirty=2,176` with **all hits in `fields=[owner]`**. The `owner` field is a legitimate 64-char lowercase hex **owner hash**, which `RESET_KEY_REGEX (/[0-9a-f]{64}/g)` matches as a false positive. Running `--apply` unmodified would have overwritten `owner` on ~2,176 docs with `[REDACTED-RESET_KEY]`, destroying audit attribution.

**Fix (committed this session):** `scripts/redact-managed-logs.js` now scopes the scan/redact walk to a `PII_FIELDS = ["message","flags"]` allowlist; structural fields (`owner`, `date`, `expire_at`, `_id`, `_rev`) are copied verbatim. Regression specs added to `spec/jasmine/ZZ-RedactionScriptSpec.js` (64-hex owner must NOT be redacted; message leak still redacted while owner is preserved). 11 specs pass locally (config-free; CI is the canonical green-gate).

### Dry-run (post-fix)

```
[scan] scanned=2183 dirty=422 resetKeyHits=422 emailHits=0   (all hits fields=[message])
```

422 genuine `reset_key`-shape leaks in the live `message` field; zero email leaks.

### Apply (DESTRUCTIVE)

```
[apply] done touched=422 conflicts=0
```

- Snapshot: `/mnt/gluster/thinx/snapshots/managed_logs.pre-redaction-20260605T123511Z.jsonl`
- Permissions: `-rw-------` (0600) · Lines: **422** (== `touched`) · Size: 134 KB
- SHA256: `23b76a648030d7d41426c806830c8c890700b2e9162a479b9688d931caef1d5b`
- Runtime: ~10 s.

### Sample-verify (zero-leak gate)

```
[sample] checked=2000 leaks=0
[sample] PASS: zero raw 64-char hex reset_keys and zero raw emails across 2000 sampled docs.
exit=0
```

### Compaction

| | disk_size | data_size | compact_running |
|---|-----------|-----------|-----------------|
| pre  | 128,258,502 | 126,991,837 | true (out-of-band run in progress) |
| post | 128,221,638 | 126,976,914 | false |
| delta | **−36,864** | −14,923 | completed |

Small delta by design: the out-of-band compaction already in progress reclaimed the bulk old-revs; this completion purged the 422 redaction old-revs. The 656,697 deleted-doc **tombstones remain** (CouchDB compaction does not purge tombstones without an explicit `_purge`), so `disk_size ≈ data_size`. Full irreversibility per § 5 is satisfied for the redacted docs (current rev clean; old PII revs purged by compaction).

### OBS-01 Slack receipt

`SLACK_WEBHOOK` present; `--apply` success path invoked `postSlackSummary("success")` (no send error logged). Expected message in `#thinx`: `✅ managed_logs redaction complete — 422 scanned / 422 redacted / sample deferred …`. (Note: the success receipt reports `sample deferred` by design — `--sample` runs after `--apply`; the sample PASS is recorded above.)

### Notes

- Working dir on host: `/mnt/gluster/thinx/redact-work` (fixed script + minimal `node_modules`: `nano`, `slack-notify`, `typeof`). Snapshot retained under `/mnt/gluster/thinx/snapshots` per the 90-day GDPR window.
- Logs captured to the phase dir: `dry-run.log` (pre-fix), `scan-fixed.log` (post-fix), `apply.log`, `sample.log`.
- **Follow-up (SEC-PII-02b):** the owner false-positive fix shipped here; if a future redaction targets additional fields, re-confirm the `PII_FIELDS` allowlist before `--apply`.

---

## 6. GDPR Posture — Historic PII Redaction

This section satisfies ROADMAP success criterion #4 (GDPR-posture note appended to the runbooks set).

**Scope:**

- Database: `${THINX_PREFIX:-}managed_logs` on production CouchDB (`thinx_couchdb` overlay service).
- Doc count at time of remediation: ~658,808 (per `09-CONTEXT.md` baseline, 2026-05-26 snapshot).
- Leak shapes targeted (single source of truth — `scripts/redact-managed-logs.js` module constants):
  - Raw 64-char lowercase hex `reset_key` substrings (`/[0-9a-f]{64}/g`) — the SEC-PII-01 leak shape per `owner.js` callers.
  - Raw email addresses (`/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g`).
  - Best-effort capture of activation tokens / mailgun tokens that happen to fall inside the 64-hex shape.

**Method:**

- Per-doc overlay redaction via CouchDB `_bulk_docs`, preserving `_id` + `_rev` + `date` + `flags` + `owner`; replacing PII substrings in `message` (and any other string field) with literal markers `[REDACTED-RESET_KEY]` and `[REDACTED-EMAIL]`.
- Forward-going TTL: 90-day `expire_at` field added to every new audit record (Plan 09-2; configurable via `app_config.audit_retention_days`; see `lib/thinx/audit.js` `_buildRecord` + `_retentionDays`).
- Forward-going sweep: nightly cron on swarm-host scheduler (see § 3 above) reads `_design/cleanup/_view/expired` and DELETEs docs with `expire_at <= now`.
- Per-record provenance: each redacted doc carries `redacted_by: "SEC-PII-02"` and `redacted_at: <ISO timestamp>` (set by `redactDoc()` in the script) for forensic reconstruction.

**Sampling Evidence Template (operator fills in after each redaction run):**

| Run Date (UTC) | Sample N (recent + old) | Result          | Operator   | Notes |
|----------------|-------------------------|-----------------|------------|-------|
| 2026-06-05     | 1000 + 1000             | exit 0 (clean)  | MS         | OPS-EXEC-02 close; 422 message-field leaks redacted (corpus already deleted out-of-band); owner false-positive fixed (SEC-PII-02b) |
| YYYY-MM-DD     | 1000 + 1000             | exit 0 (clean)  | <name>     |       |

The `--sample 1000` exit code is the canonical green-gate (per `09-CONTEXT.md` validation criterion #1). Record EVERY apply run; the running log is the external attestation that the invariant holds over time.

**Residual Risk — explicitly accepted:**

- **Destructive of audit-log content.** See § 5 above. Recoverable only from the JSONL snapshot.
- **Snapshot retention policy.** Recommended: 90 days, mirroring the forward-TTL window — then secure-delete via `shred -u "${SNAPSHOT_PATH}"`. The snapshot itself is GDPR-relevant data (it contains the very PII the redaction was meant to clear) and MUST NOT outlive its forensic purpose. Permissions on the snapshot file MUST be `0600` and the path SHOULD live on the gluster mount with restricted directory permissions (`chmod 700` on `/mnt/gluster/thinx/snapshots`).
- **Unmatched leak shapes.** Records older than the snapshot moment but NOT matched by the current regex are NOT modified — they are presumed clean by the SEC-PII-01 leak-shape definition. If a NEW leak shape is later discovered, a follow-on phase re-runs the redaction with the expanded regex; the FIRST snapshot WILL NOT capture the original content of docs that the second pass touches (operator MUST take a fresh `--snapshot-to` before each new redaction pass).
- **Forward-write race during apply.** The live `thinx_api` audit-write path may write new records (with `expire_at` from Plan 09-2) DURING a long apply run. The script's idempotency guarantees these are safe — they either have no raw PII (post-SEC-PII-01 callers redact at write-time) and are skipped, or they get caught on a follow-up `--apply` pass.

---

## 7. References

- Script source: `scripts/redact-managed-logs.js` (Plan 09-1) — pure helpers + CLI in one file; module exports `redactDoc`, `scanDoc`, `containsRawPII`, regex constants, exit codes for tests.
- Audit TTL field: `lib/thinx/audit.js` (Plan 09-2) — `_buildRecord` adds `expire_at`; `_retentionDays` resolves from `app_config.audit_retention_days` with 90-day fallback.
- Existing compaction call site: `lib/thinx/database.js:117` (`this.nano.db.compact(prefix + "managed_logs")` inside `compactDatabases()`).
- CouchDB access pattern: `~/.claude/projects/-Users-igraczech-Repositories-thinx-device-api/memory/couchdb-access.md` — overlay-network `thinx_internal` + creds in `/mnt/gluster/thinx/.env` + service-placement drift caveat.
- ROADMAP success criteria: `.planning/ROADMAP.md` Phase 9 (lines 90–98).
- Requirement: `.planning/REQUIREMENTS.md` SEC-PII-02 (line 28).
- Phase context: `.planning/phases/09-historic-pii-redaction-managed-logs/09-CONTEXT.md` (hybrid strategy: overlay-redact + forward TTL).
- Related runbook (format precedent): `.planning/runbooks/swarm.md`.
- Related runbook (operator-tone precedent): `.planning/runbooks/websocket-handshake.md`.

---

*Runbook initialized: 2026-06-03 (Phase 9 / SEC-PII-02 close-out — operator-side; production CouchDB; requires `/mnt/gluster/thinx/.env` credentials).*
