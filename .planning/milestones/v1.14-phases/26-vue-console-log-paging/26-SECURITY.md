---
phase: "26"
slug: "vue-console-log-paging"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-03"
---

# Phase 26 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser (Vue console session) → `/api/v2/logs/*` | Untrusted `limit` / `cursor` query params; owner must come only from the session |
| API → CouchDB `managed_logs` / `managed_builds` views | Owner-keyed paging views; cursors must never select another owner's rows |
| API boot → CouchDB design docs | Rev-aware upsert of `_design/paging`; `_design/logs` must stay untouched; failures must not crash boot |
| audit writers → audit log documents | Flags must be literal strings, never credential objects |
| operator CLI scripts (probe, D-15 cleanup, retention) → production CouchDB / gluster | Aggregate-only output; dry run by default; destructive apply gated by operator answer |
| cron on micro (root) → retention container → gluster `deploy` / `repos` | Path-gated deletes (UUID depth-3, realpath, symlink checks), read-only mounts unless the root is approved |
| repo → origin thinx-staging → CI → production | Pushes autoredeploy; console submodule pointer bumps |
| production evidence → SUMMARY / runbook (public repo) | No 64-hex, emails, UUIDs or credentials recorded |

---

## Threat Register

Register authored at plan time across 26-01..26-10 (each plan carries its own plan-scoped `T-26-SC` supply-chain row). 58 rows: 13 high, 26 medium, 19 low.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-26-01 | Information disclosure | audit_by_owner_date map, Audit.toAuditItem | high | mitigate | The map emits string flags only (1–32 chars, fallback info), and toAuditItem re-filters on both fetch paths. AuditOwnerFetchSpec feeds a doc whose flags hold {password, reset_key, email} and asserts ["info"]. | closed |
| T-26-02 | Information disclosure | Audit.fetch range (cross-tenant) | high | mitigate | startkey [owner,{}] and endkey [owner] both come from the session owner. A non-string owner returns [] with no query. The fallback uses strict equality instead of the old substring indexOf. The spec covers a substring… | closed |
| T-26-03 | Denial of service | boot upsert, first query during index build | medium | mitigate | ensureDesignDoc never rejects and has a 5 s timeout. It never goes through handleDatabaseErrors, so no process.exit (spy-asserted). Audit.fetch falls back after VIEW_TIMEOUT_MS. | closed |
| T-26-04 | Tampering | `_design/logs` (D-13) | medium | mitigate | Separate id `_design/paging`. The spec asserts only that id is inserted; verify diffs design_logs.json against origin. | closed |
| T-26-05 | Information disclosure | design-upsert and fallback log lines | low | mitigate | The lines interpolate db name, action and reason codes only, never the error object (which can carry the credentialed URL) and never the owner. | closed |
| T-26-06 | Information disclosure | cursor replay across tenants | high | mitigate | buildQuery binds startkey[0] and endkey to the session owner for every cursor; the cursor carries only {v,k,i}. LogPagingSpec covers forged k values, and ZZ-LogPagingCouchSpec replays A's cursor as B against real Couc… | closed |
| T-26-07 | Tampering / Denial of service | forged cursor, oversized limit, repeated params | medium | mitigate | decodeCursor checks type, length ≤512, charset, kind and the i length/control chars. parseLimit takes `^\d{1,4}$` and clamps to [1,200]. Arrays get a 400. All covered by spec. | closed |
| T-26-08 | Elevation / Information disclosure | owner from query or body | high | mitigate | Handlers read the owner only from sanitka.owner(req.session.owner). LogRouterPagingSpec sends `owner=<other>` and asserts the model got the session owner. | closed |
| T-26-09 | Tampering (integrity) | build reads deleting records | medium | mitigate | The prune method is removed and list/listPage never call destroy (spec plus grep gate); the probe compares doc_del_count before and after. | closed |
| T-26-10 | Information disclosure | GDPR purge missing nested builds (D-18) | medium | mitigate | purgeOwner ranges over builds_by_owner_time with include_docs and falls back to latest_builds on error. The CI spec destroys a seeded nested doc. | closed |
| T-26-11 | Information disclosure | probe output, log lines | medium | mitigate | Aggregates only. LogPagingProbeSpec asserts no 64-hex, "@" or cursor in output. Touched router lines drop the owner id. | closed |
| T-26-12 | Information disclosure | owner.js:417 / sources.js:361 audit writers | high | mitigate | Both pass "info". AuditFlagWritersSpec scans every `alog.log` call site under lib/ and rejects a non-literal third argument. | closed |
| T-26-13 | Information disclosure | set_password_reset debug line (user doc, password hash, reset key, email in API logs) | high | mitigate | Replaced by a value-free info line; the spec asserts no JSON.stringify of the user doc or the changes in that function. | closed |
| T-26-14 | Information disclosure | cleanup CLI output and error paths | high | mitigate | Aggregates and presence counts only; errors reduced to statusCode:error. The spec asserts no 64-hex, "@", id or "http" in any captured output, including a credentialed error object. | closed |
| T-26-15 | Tampering | cleanup apply hitting wrong docs or fields | medium | mitigate | Dry run is the default and `--apply` requires explicit `--targets` (exit 2 otherwise). reset_key goes through the users/edit handler on the latest rev; audit writes change only `flags`. Conflicts are reported and a re… | closed |
| T-26-16 | Repudiation | no snapshot of redacted docs | low | accept | D-15 makes the redaction one-way on purpose. A snapshot would re-store the hashes and keys. Aggregates are recorded in the runbook annex by plan 26-06. | closed |
| T-26-17 | Tampering / Elevation | deletion path built from DB-sourced owner/udid/build_id | high | mitigate | strictOwner plus strict UUID regexes, then safepath.resolveInside per root at plan time and again immediately before rm. lstat must show a directory. Depth is exactly 3. The spec covers a symlinked owner dir, a prefix… | closed |
| T-26-18 | Tampering (integrity) | mass deletion on a CouchDB outage | high | mitigate | A failed record read is FAIL with nothing deleted. Zero rows aborts the orphan sweep. Both paths are covered by spec. | closed |
| T-26-19 | Tampering | OTA files (udid-level build.json/zip/firmware.bin), avatar.json, repo-name dirs | high | mitigate | Never candidates (depth and UUID rules); spec fixtures assert they survive apply. | closed |
| T-26-20 | Information disclosure | job output and host log | medium | mitigate | formatReport emits only contracted keys with counts, bytes and dates. The spec asserts no fixture ids, UUIDs, tmp paths or 64-hex. | closed |
| T-26-21 | Information disclosure | credentials in the wrapper | medium | mitigate | Read from the service spec, exported and passed by name; no tracing. The wrapper test asserts the value never appears in docker argv. Nothing host-specific is committed (verify gate). | closed |
| T-26-22 | Denial of service | running retention inside the 256M API container | medium | mitigate | A one-shot container with `--memory 256m` on thinx_internal; never docker exec into thinx_api (D-17). | closed |
| T-26-23 | Tampering | dry run mutating data, or an apply writing an unapproved root | medium | mitigate | The dry-run code path has no delete calls (spec compares fixture listings). The wrapper mounts both roots `:ro` for dry runs and, for an apply, mounts read-write only the roots named in `--roots` (wrapper test covers … | closed |
| T-26-24 | Tampering | cursor handling in the client | low | mitigate | The client never parses or builds cursors; it URL-encodes the server value (`pagedPath`, unit-tested with `/+=`). The server validates and owner-binds (plan 26-02). | closed |
| T-26-25 | Tampering (integrity of displayed data) | background first-page refresh splicing a stale page | low | mitigate | History owns its arrays and cursors and appends only its own responses. Unit label "History ignores a background first-page refresh". | closed |
| T-26-26 | Spoofing | Cypress session-token stub | low | accept | Test-only intercept in `cypress/support/session.js`; never bundled into the app and never sent beyond the local Cypress run. | closed |
| T-26-27 | Denial of service | index build after the upsert (0.2 CPU CouchDB), push windows | medium | mitigate | Time-window precondition; classic audit calls fall back during the build (plan 26-01); the build is polled to completion and timed; past 60 min a checkpoint offers a digest rollback. | closed |
| T-26-28 | Information disclosure | probe, dry-run and apply output in the SUMMARY and runbook | high | mitigate | The tools print aggregates only (plans 26-02/26-03 specs); the verify commands reject a 64-hex string, "@" or a URL in the output; the runbook is checked for 64-hex. | closed |
| T-26-29 | Tampering | wrong deploy path (main push, stack deploy, early Vue ship) | medium | mitigate | thinx-staging only; PUSH1-BACKEND-ONLY checks the console gitlink is unchanged; no restart.sh or stack deploy (WR-02). | closed |
| T-26-30 | Information disclosure | secrets in the pushed diff | medium | mitigate | Pre-push pattern scan (secret_hits=0), as in plan 25-04. | closed |
| T-26-31 | Tampering | D-15 apply beyond the approval | high | mitigate | Blocking-human decision first; `--targets` is exactly the mapped answer; one apply plus at most one converging rerun; the post-apply dry run must show 0 for applied targets; the script touches only reset_key and flags… | closed |
| T-26-32 | Denial of service | users mid password reset | low | accept | D-15 accepts it: affected users request a new reset; the reset flow itself is unchanged. | closed |
| T-26-33 | Tampering | Push 2 rollout (wrong pin, force push, main) | medium | mitigate | Fast-forward console push; the gitlink must equal the pushed console HEAD (VUE-PUSHED-AND-BUMPED); thinx-staging only; four CI jobs green; served-bundle check; rollback by recorded digest. | closed |
| T-26-34 | Denial of service | a re-index on every API restart | medium | mitigate | The canonical compare in ensureDesignDoc skips the write. Task 3 proves `action=unchanged` and equal rev generations on a real restart. | closed |
| T-26-35 | Information disclosure | evidence in the SUMMARY, runbook and REQUIREMENTS | medium | mitigate | Aggregates, SHAs and digests only; the UAT records no identifiers. | closed |
| T-26-36 | Information disclosure | secrets in the pushed diffs | medium | mitigate | Pre-push pattern scan of both repos (secret_hits=0). | closed |
| T-26-37 | Tampering | one-way deletion beyond the approved scope | high | mitigate | A blocking-human decision with per-root options (all, deploy-only, repos-only, audit-only, defer); the flags map 1:1 to the answer and are recorded as `approved_roots=`; RETENTION-CONVERGED checks every approved root;… | closed |
| T-26-38 | Tampering / Elevation | root-run wrapper on the manager | medium | mitigate | Installed from the reviewed repo file with sha256 match, root:root 0755, through an atomic mv; the wrapper is tested (plan 26-04). | closed |
| T-26-39 | Denial of service (silent failure) | a daily job that deletes nothing and looks fine (Pitfall 9) | medium | mitigate | The wrapper exits 1 without an OK line, and cron mails the wrapper's output to root as cron.daily did. The first scheduled run's log can be checked in the next session. | closed |
| T-26-40 | Information disclosure | host log and evidence | medium | mitigate | Aggregate-only output (plan 26-04 spec); verify rejects 64-hex strings and paths in the output and in the host log. | closed |
| T-26-41 | Repudiation | which scope was approved | low | mitigate | The answer, the flags and the cron line are recorded in the annex and the SUMMARY. | closed |
| T-26-42 | Information disclosure / Tampering | a spec run that reaches the live API (login.spec.js, the full suite, or an unstubbed call) | medium | mitigate | Every verify command names exactly the three stubbed specs; the `stubThinxApi()` catch-all answers any other `/api/v2/` call locally; paged intercepts are registered after it; fixtures use synthetic identifiers only. | closed |
| T-26-43 | Denial of service / Tampering (integrity) | a one-way run overlapping an unattended-upgrade dockerd restart | medium | mitigate | Dedicated `/etc/cron.d` slot at 09:40 UTC instead of cron.daily (06:25); SCHEDULE-AND-RETIREMENT-OK rejects any slot in 01:00–05:00 or 06:00–07:10 UTC. A run cut short leaves orphan records, never untracked folders (f… | closed |
| T-26-44 | Tampering | Deploy path (force push, main, wrong pin) | medium | mitigate | Fast-forward console push only. The origin gitlink must equal the pushed console HEAD and differ from 3e775252 (VUE-FIX-PUSHED-AND-BUMPED). Only `git add services/console` is staged. thinx-staging only. Four CI jobs m… | closed |
| T-26-45 | Information disclosure | Secrets in the pushed diffs | medium | mitigate | Pre-push pattern scan of both outgoing diffs with plan 26-06's list (`secret_hits=0`, else STOP). The console diff is limited to three files (CONSOLE-FIX-COMMITTED). | closed |
| T-26-46 | Information disclosure | Evidence in the SUMMARY and UAT | low | mitigate | Only counts, SHAs, 12-hex digest prefixes and contrast ratios are recorded. The UAT re-test records no identifiers, and no test runs against the live API. | closed |
| T-26-47 | Denial of service | Rollout restarts (thinx_vue, thinx_console, thinx_api) and the 09:40 UTC retention job | medium | mitigate | The push needs the operator's "push" answer (D-14) and runs outside 01:00–05:00 and 09:25–10:15 UTC. Stop-first rollouts. thinx_api must re-boot with `_design/paging action=unchanged` and a Running task. Rollback by r… | closed |
| T-26-48 | Repudiation | Unsigned or hook-bypassing commits | low | mitigate | `commit.gpgsign=true` in both repos and the signature status is checked (`%G?` = G). A locked agent stops at a human-action checkpoint, never at `--no-gpg-sign` or `--no-verify`. | closed |
| 26-01/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed in this plan. | closed |
| 26-02/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed in this plan. | closed |
| 26-03/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed in this plan. | closed |
| 26-04/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed in this plan. | closed |
| 26-05/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed; only existing bootstrap-vue, vuex and cypress are used. | closed |
| 26-06/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. | closed |
| 26-07/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed; `npm run build` uses the existing lockfile and node_modules. | closed |
| 26-08/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. | closed |
| 26-09/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed; the existing Cypress 9.7 and start-server-and-test are used. | closed |
| 26-10/T-26-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. The check uses the existing `sass` devDependency and `npm run build` the existing node_modules. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Per-threat verification evidence (file:line, spec, or runbook annex row in `.planning/runbooks/log-paging-retention.md` § Phase 26 Execution Annex) is summarised in the 2026-10-03 audit below.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-26-01 | T-26-16 | D-15 credential cleanup is one-way by design; aggregates recorded in annex "D-15 dry run" / "D-15 apply" | plan 26-03 (operator-approved) | 2026-10-02 |
| AR-26-02 | T-26-26 | Cypress session stub lives only in `vue/cypress/support/session.js`; never bundled | plan 26-09 | 2026-10-02 |
| AR-26-03 | T-26-32 | D-15 reset_key clearing may invalidate an in-flight reset link; reset flow unchanged | plan 26-06 | 2026-10-02 |
| AR-26-04 | 26-0x/T-26-SC (10 plans) | No dependency or lockfile change in any plan (only `package.json` / `vue/package.json` scripts) | plans 26-01..26-10 | 2026-10-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-03 | 58 | 58 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

### Security Audit 2026-10-03

| Metric | Count |
|--------|-------|
| Threats found | 58 |
| Closed | 58 |
| Open | 0 |

- Code mitigations verified by file:line and spec; operational mitigations against the annex, SUMMARYs and the fresh 26-VERIFICATION.md (live probe: cursor owner-free, foreign replay 0, legacy flags strings only, builds_del 103/103, `_design/logs` rev gen 1). No production access in this audit.
- Re-run on current tree: 13 Phase 26 jasmine specs (228 specs, 0 failures); retention wrapper/installer `node --test` 35/35.
- Phase 27 and the concurrent CR-01 fix did not touch Phase 26 backend/design/script files; every `alog.log` third argument is still a literal.
- Unregistered flag (resolved): 26-03 `owner.js atomic()` error path logged a password hash — fixed in `1b7dfc74`/`24d5510d`; OwnerLogLeakSpec green.

Informational (non-blocking):
1. CI does not enforce the jasmine guards: `package.json` `test` is `jasmine || true`; only `test:node` gates the build.
2. Commits `aa3a54eb`, `fe4ef6e9`, `520b1259`, `4497c690` (26-06/26-07) are unsigned under operator authorization (outside T-26-48, which covers 26-10).
3. The pushed `.planning` plan text contains the manager ssh endpoint (already public in AGENTS.md).
4. T-26-39's "cron mails root" relies on an MTA on micro, not verified; the fail-loud exit code and the checked first run carry the mitigation.
5. Pre-existing items outside the register stay open in 26-REVIEW-DISPOSITION: IN-07, IN-08, WR-03.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-03
