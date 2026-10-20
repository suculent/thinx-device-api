---
phase: "47"
slug: "build-log-search-status-colours"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-15"
---

# Phase 47 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| API -> browser (GET /logs/build/<id>) | build-log text comes from firmware builds and is untrusted for rendering | build output (may hold environment values) |
| user -> dialog (search term) | the typed term becomes a RegExp and drives DOM size | free text, local only |
| list row -> dialog (build object) | the row's build id decides which log is requested | build id |
| API -> browser (build lists) | build names, aliases, udids and statuses are untrusted for rendering | build/device metadata |
| repository -> review ledgers | ledgers are the audit record that a finding was fixed | commit references |
| local branches -> origin thinx-staging | the shared branches reach production through CircleCI and Swarmpit | source, gitlink |
| CircleCI -> registry -> swarm | the push pipeline builds and rolls out the API and Vue images | container images |
| verifier -> production / CircleCI | unauthenticated probes and API reads | status codes, sizes, markers |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-47-01 | Tampering | log text rendered with highlights (stored XSS) | high | mitigate | text interpolation only; `BuildLogDialog.vue` has 0 `v-html` / `innerHTML`; unit check D4 | closed |
| T-47-02 | Denial of service | multi-MB logs with many matches | medium | mitigate | 3-char minimum, 200 ms debounce, scan capped at 1000 in `buildLogSearch` (S4) | closed |
| T-47-03 | Denial of service | search term compiled into a RegExp | medium | mitigate | `escapeRegExp()` in `utils/buildLog.js:62` escapes every metacharacter; empty-match guard (S2) | closed |
| T-47-04 | Information disclosure | search term and log text | low | mitigate | no console, storage or router use in the dialog (grep 0); term reset on open | closed |
| T-47-05 | Spoofing | list-index id sent as a build id | medium | mitigate | `open()` returns early unless `build_id` is a non-empty string (`BuildLogDialog.vue:101-102`, L1) | closed |
| T-47-06 | Tampering | stale response after close/reopen | low | mitigate | `requestId` guard plus `onHidden` reset (L4) | closed |
| T-47-07 | Spoofing | status colours on the four build lists | medium | mitigate | all four surfaces use `buildStatusVariant` (N3–N5) | closed |
| T-47-08 | Tampering | names/aliases/udids in dashboard and navbar (stored XSS) | medium | mitigate | 0 `v-html` in `Visits.vue` and `Notifications.vue`; interpolation only | closed |
| T-47-09 | Information disclosure | row without build id requesting `/logs/build/<index>` | low | mitigate | `build-no-log` placeholder, `listGroupItem--static` rows, id-only `open()` (V3, V6, N1, H2) | closed |
| T-47-10 | Repudiation | findings recorded fixed without evidence | low | mitigate | `36-REVIEW-DISPOSITION.md` `open: 0` with console commits; WR-01 mutation checks (a)–(d) | closed |
| T-47-11 | Tampering | shared parent thinx-staging branch | high | mitigate | pushed range `6d47a5fb..ab378790`: 19 commits, all `G`, 0 merges, only `services/console` outside `.planning/`; origin/main unchanged | closed |
| T-47-12 | Tampering | console thinx-staging branch | medium | mitigate | `31bce2b..591033e`: 12 commits, all `G`, Phase 47 Vue paths only, fast-forward | closed |
| T-47-13 | Denial of service | production console and API after rollout | high | mitigate | local preflight + `CI-GATES PIPELINE OK 5673`; live 401s on profile and build-log routes; 7442 unchanged; Legacy byte-identical | closed |
| T-47-14 | Repudiation | pushed commits | medium | mitigate | `%G?` = G on every console and parent outgoing commit | closed |
| T-47-15 | Information disclosure | verification probes and evidence | medium | mitigate | probes credential-free; only codes, sizes and marker counts recorded (47-03-SUMMARY) | closed |
| T-47-SC | Tampering | npm/pip/cargo installs | low | mitigate | no lock-file change in `31bce2b..591033e`; `package.json` changes only the test:unit chain | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-15 | 16 | 16 | 0 | secure-phase orchestrator (ASVS L1 grep, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-15
