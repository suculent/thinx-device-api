# Phase 2 — Checkpoint: Post-deploy log-tail UAT

**Created:** 2026-05-26
**Status:** Awaiting operator
**Plan task:** Task 5 (`checkpoint:human-verify`, `gate=blocking`)
**Deploy reference:** `daccf732` -> `thinxcloud/api:latest@sha256:3a461b3d...` (rolled at 17:15:42 UTC)

## Why this checkpoint exists

Phase 1 lesson — probe BOTH the success and the error paths after deploy, not
just the happy path. A redactor that handles success but leaves the error path
leaking is the exact failure mode Wave 2's tightening commit `c67d9af` was
added to address.

Automation has confirmed:
- CI green on all 3 builds for `daccf732` (13833, 13834, 13835).
- New image `3a461b3d` is `Running` on `thinx_api.1` (prior `195cb19a` shut down).
- Probe A (unregistered email) returns HTTP 200 with Phase 1 envelope.
- Probe E (Bearer null negative-control) returns HTTP 200 with Phase 1 envelope.

What automation CANNOT confirm without the operator: that the LIVE production
log tail (stdout via `docker service logs`) and the CouchDB `managed_logs` doc
both emit only the redacted forms. That requires a side-by-side `docker logs
--follow` + curl correlation, plus a privileged CouchDB query.

## The 5-probe matrix

### Probe A — Unregistered email (error path, owner.js L515 redaction)

In **terminal 1** (start tail FIRST, then run curl in terminal 2):

```bash
ssh -p 2020 -i ~/.ssh/DOKey2 root@188.166.23.244 \
  'docker service logs thinx_api --tail 5 --follow' \
  | grep -E '\''(password_reset_init|@|cloud)'\''
```

In **terminal 2**:

```bash
curl -X POST https://rtm.thinx.cloud/api/v2/password/reset \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://console.thinx.cloud' \
  --data '{"email":"never-registered-redaction-probe-2026@thinx.cloud"}'
```

**Expected response (already verified by automation):**

```
HTTP 200
{"success":true,"response":"password_reset_request_accepted"}
```

**PASS criteria (log tail in terminal 1):**

- At least one line contains `n***@thinx.cloud` (first char of local-part is `n`)
- NO line contains the literal local-part `never-registered-redaction-probe-2026`
- NO line dumps a full CouchDB `{body}` envelope; the `{rows: 0}` form is what
  the redacted shape now emits

**FAIL criteria:**

- Any line contains the raw local-part `never-registered-redaction-probe-2026`
- Any line dumps `{body: { rows: [...], total_rows: ...}}` (the CouchDB view
  envelope — still leaks the email as the view key)

---

### Probe B — Registered email (success path, owner.js L460 audit + L483 + L189)

This probe needs a known-good registered account on `rtm.thinx.cloud`. If you
have one, use its email below. If you don't, **mark `B: SKIP`** — Task 3's spec
(`ZZ-OwnerLogRedactionSpec.js`) exercises the same code path in CI against the
test-stack and is sufficient evidence for the success path.

In **terminal 1** (continue tailing or restart):

```bash
ssh -p 2020 -i ~/.ssh/DOKey2 root@188.166.23.244 \
  'docker service logs thinx_api --tail 5 --follow' \
  | grep -E '\''(reset_key|password|alog|Attempt)'\''
```

In **terminal 2**:

```bash
curl -X POST https://rtm.thinx.cloud/api/v2/password/reset \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://console.thinx.cloud' \
  --data '{"email":"<KNOWN_REGISTERED_EMAIL>"}'
```

**PASS criteria:**

- At least one line of the form `Attempt to reset password with: <6hex>…`
  (6 hex chars + Unicode U+2026 ellipsis `…`, NOT three ASCII dots)
- At least one line of the form `Attempting to reset password with key <6hex>…`
- At least one line of the form `will send reset e-mail with key <6hex>…`
- NO line ANYWHERE contains a full 64-character hex string
- HTTP response is 200

**FAIL criteria:**

- Any line contains a full 64-character hex string (the raw reset_key)
- Any line contains the original `Resetting password <key>using ...` form
  (note the missing space — opportunistic fix landed in the same sweep)

---

### Probe C — CouchDB audit log persisted form (owner.js L460/L592)

This is the **highest-priority** check — the audit log persists indefinitely
in CouchDB and is queryable, unlike the rotating stdout.

```bash
ssh -p 2020 -i ~/.ssh/DOKey2 root@188.166.23.244 \
  'CID=$(docker ps -qf name=thinx_couchdb); \
   docker exec "$CID" curl -s -u admin:$COUCH_ADMIN_PASS \
     "http://localhost:5984/managed_logs/_all_docs?include_docs=true&limit=20&descending=true"' \
  | python3 -c '\''import json,sys; d=json.load(sys.stdin); \
  rows=[r["doc"]["message"] for r in d["rows"] if "Attempt" in r["doc"].get("message","")]; \
  [print(m) for m in rows[:10]]'\''
```

(`$COUCH_ADMIN_PASS` is set in the swarm env; the host will expand it on the
remote side via the outer single-quote / inner double-quote.)

If you don't have direct access to the CouchDB admin password, an acceptable
fallback is to **rely on Probe B's stdout evidence** — `alog.log` writes BOTH
to the CouchDB row AND emits a stdout side effect via `lib/thinx/audit.js`
error handling. If Probe B shows redacted `Attempt to reset...` lines, the
persisted CouchDB doc will carry the same string (the redacted message is the
SAME string parameter passed to `alog.log`).

**PASS criteria:**

- Recent docs (last 20) with `"message"` starting with `"Attempt to reset password with: "`
  or `"Attempt to set password with: "` show the redacted `<6hex>…` form
- NO doc contains a full 64-character hex string in its message field

**FAIL criteria:**

- Any recent doc contains a full 64-character hex token in its message field

---

### Probe D — Activation token redaction (owner.js L228/L537/L662)

Activation is one-time; difficult to exercise live without registering a fresh
account.

**This probe may be skipped** (`D: SKIP`) — the `Task 3` spec covers L228 via
the source-shape regression bait and the AuditLog prototype-patch capture.
Production log evidence is nice-to-have but not blocking for v1 GA exit.

If you DO want to exercise it: register a throwaway account via the console
UI, capture the activation email link, and inspect the swarm log tail for
`Sending activation e-mail to ... with token ...` lines. PASS criteria: email
shown as `<first-char>***@<domain>`, token as `<6hex>…`.

---

### Probe E — Negative control (Phase 1 not regressed)

Already verified by automation pre-handoff:

```bash
curl -X POST https://rtm.thinx.cloud/api/v2/password/reset \
  -H 'Authorization: Bearer null' \
  -H 'Content-Type: application/json' \
  --data '{"email":"x@y.z"}'
```

Returned: `HTTP 200 {"success":true,"response":"password_reset_request_accepted"}`.
Identical envelope shape to Probe A. **PASS by automation.**

If you re-run it manually and observe a different status (e.g. 403 — which is
exactly what Phase 1 G8 fixed) — **mark `E: FAIL`** and escalate; that would
be a Phase 2-induced regression of Phase 1.

---

## How to resume

After running the probes, post one of the following in your next message to
the orchestrator (the auto-mode chain will respawn the executor with the
resume signal — Task 6 will write the close-out artifacts):

- **All green / acceptable mix:**
  ```
  approved A:PASS B:PASS C:PASS D:SKIP E:PASS
  ```
  or
  ```
  approved A:PASS B:SKIP C:SKIP D:SKIP E:PASS
  ```
  (B/C may SKIP if no registered test account / no CouchDB admin access)

- **Any failure:**
  ```
  failed <probe>: <observed leak details>
  ```

Reversion guidance is in 02-PLAN.md Task 6 action 1; until that SUMMARY is
written, the three per-task atomic commits can be reverted individually:

- `feat(util) 0de30806` — helpers (safe to keep even if sweep is reverted)
- `fix(owner) 0314c9a0` — the sweep itself; revert this to roll back PII
  scrub while keeping helpers + spec
- `test(spec) daccf732` — the spec; revert only if it blocks CI for an
  unrelated reason

`git revert <hash>` then push; CI green; redeploy via the same restart.sh
path. Phase 2 returns to "Active" in STATE.md.
