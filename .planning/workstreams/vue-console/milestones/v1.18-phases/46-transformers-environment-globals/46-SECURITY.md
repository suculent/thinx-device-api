---
phase: "46"
slug: "transformers-environment-globals"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
block_on: high
created: "2026-10-14"
---

# Phase 46 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> The register was written at plan time (46-01..46-06-PLAN.md `<threat_model>`). It was verified on 2026-10-14 by
> gsd-security-auditor at ASVS L1: 42/42 closed (39 mitigate, 3 accept). The audit was read-only. Locally it ran
> ApienvExactKeySpec and CsrfRouteInventorySpec (89 specs, 0 failures) and `tests/unit/transformers-enviros.cjs`
> (63 ok, 0 FAIL). Console submodule at 31bce2b (= parent gitlink).

Path roots: `P` = parent repo, `V` = `services/console/vue`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser -> API PUT/DELETE /api/v2/env, POST /api/user/env/* | env writes under a cookie session or Bearer token | untrusted `key`, `value`, `names`; values are secrets (Wi-Fi passwords, tokens) |
| API -> Redis `env:<owner>` | the whole variable array is rewritten on every add or overwrite | owner's env variables |
| Redis -> firmware builds | builder.js reads the owner's variables into every build | env variables |
| API -> browser (profile, device list, GET /env) | transformer names, device documents and variable names are user-entered | untrusted for rendering; env values never cross |
| browser -> API POST /api/v2/profile | transformer delete rewrites `info.transformers` | transformer list |
| browser -> API PUT /api/v2/device | Device Detail saves (alias, description, environment, transformers) | device fields; environment carries `ssid` / `pass` |
| user -> router / Device Detail page | navigation can leave unsaved drafts; several card drafts live side by side | unsaved edits |
| local branches -> origin thinx-staging -> CircleCI -> registry -> swarm | everything pushed reaches production | code, images |
| verifier -> production / CircleCI | credential-free GETs, one empty PUT/POST, WebSocket probe, CircleCI API reads | status codes only |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-46-01 | Tampering | apienv.create name matching | high | mitigate | exact match `P/lib/thinx/apienv.js:24,38`; `indexOf` removed; ApienvExactKeySpec L1-L5, R1 | closed |
| T-46-02 | Information disclosure | env values in responses/logs/tests | medium | mitigate | no log line added; R3 names-only bodies; synthetic spec values | closed |
| T-46-03 | Spoofing | cross-site env writes (CSRF) | high | mitigate | `csrf.verifyCsrfToken` first on `P/lib/router.env.js:73,77,90,94`; R1; CsrfRouteInventorySpec:58-61 | closed |
| T-46-04 | Elevation of privilege | writing another owner's variables | high | mitigate | owner from `sanitka.owner(req.session.owner)` router.env.js:19,39,52; L4; R4 | closed |
| T-46-05 | Tampering | Legacy console compatibility | medium | mitigate | R1-R3 raw-envelope comparisons v2 vs Legacy | closed |
| T-46-06 | Repudiation | failed Redis write answered `success: true` | medium | accept | see Accepted Risks AR-46-01 and residual R2 | closed (accepted) |
| T-46-07 | Tampering | transformer names (stored XSS, bidi) | high | mitigate | text interpolation / bound `:title` only, `V/src/pages/Transformers/Transformers.vue:34,50,52`; `dir="auto"` + `unicode-bidi: isolate` (`_settings-pages.scss:26-33`); B9 | closed (L1; see R1) |
| T-46-08 | Denial of service | accidental/repeated transformer delete | high | mitigate | typed confirm Transformers.vue:108-110,191,212,206-208; usage warning :54; A3, A4, B6 | closed |
| T-46-09 | Tampering | lost update of transformers | medium | mitigate | `deleteItems` re-read + targeted filter + single write, `V/src/store/transformers.js:85-92`; S1 | closed |
| T-46-10 | Repudiation | stored write reported as failed | medium | mitigate | `refreshed: false` transformers.js:41-47; S2, A6 | closed |
| T-46-11 | Information disclosure | device list fetched for usage count | low | accept | see AR-46-02 | closed (accepted) |
| T-46-12 | Information disclosure | typed env value (secret) | high | mitigate | own input only, emptied on open/hidden, constant toast, key-only error copy, no `console.` (`V/src/pages/Enviros/Enviros.vue:59,206,219-222,240,246`); E5, E6, E7, G5 | closed |
| T-46-13 | Tampering | silent overwrite through Add | medium | mitigate | listed key refused client-side Enviros.vue:139-144; G3, G6 | closed |
| T-46-14 | Tampering | hostile variable names (stored XSS) | high | mitigate | text interpolation, plain-string confirm Enviros.vue:36-37,51,55,169-175; F5 | closed |
| T-46-15 | Denial of service | accidental/double env delete | high | mitigate | cancel-focused confirm + `confirming`/`bulkDeleting`/`deletingKeys` guards Enviros.vue:165-183,215-217; F2, F3, E4 | closed |
| T-46-16 | Tampering | partial edit | medium | mitigate | one PUT `V/src/store/enviros.js:99-102`, single `redis.set` apienv.js:45; failed edit keeps dialog Enviros.vue:246-247; E6 | closed |
| T-46-17 | Spoofing | cross-site env writes (client) | high | mitigate | `$api.$put`/`$delete` enviros.js:100,104; X-XSRF-TOKEN `V/src/core/api.js:51-55,96-102` | closed |
| T-46-18 | Tampering | unsaved assignment discarded on navigation | medium | mitigate | `beforeRouteLeave` + `leavePrompting` DeviceDetail.vue:301-308; `confirmLeave.js:10-19`; H1, H3 | closed |
| T-46-19 | Denial of service | double save | low | mitigate | single-shot guard DeviceDetail.vue:502-503; disabled controls :120,:130; I3 | closed |
| T-46-20 | Repudiation | save result misreported / ticks dropped | medium | mitigate | DeviceDetail.vue:517-520,525,123,497-500; I4, I5, I6 | closed |
| T-46-21 | Tampering | hostile names in checkbox labels | medium | mitigate | `{ value, text }` options DeviceDetail.vue:276,284; no `v-html` | closed |
| T-46-22 | Repudiation | review findings closed without record | low | mitigate | 37-REVIEW-DISPOSITION.md:22,33-34; ROADMAP Phase 48 names ed429ec | closed |
| T-46-23 | Tampering | shared parent thinx-staging | high | mitigate | 17d63319..656bb9eb: 19 commits all `G`, 0 merges, allowed paths only, fast-forward, gitlink a16307a | closed |
| T-46-24 | Tampering | console thinx-staging | medium | mitigate | 316c5f9..a16307a: 20 commits all `G`, 16 paths, no Legacy `src/`, fast-forward | closed |
| T-46-25 | Denial of service | production rollout (46-05) | high | mitigate | 46-05-SUMMARY preflight, `CI-GATES PIPELINE OK 5671`, profile 401, port 7442 200 = baseline, Legacy hashes OK | closed |
| T-46-26 | Repudiation | pushed commits | medium | mitigate | `%G?` = G on console 20+2, parent 19+9 | closed |
| T-46-27 | Information disclosure | verification probes (46-05) | medium | mitigate | status codes only; no credentials in phase dir; throwaway `P46_` variables | closed |
| T-46-28 | Tampering | credential-free PUT/POST probes | low | accept | see AR-46-03 | closed (accepted) |
| T-46-29 | Tampering | `loadDevice` re-read discarding drafts (CR-01) | medium | mitigate | DeviceDetail.vue:335-344; K1, K2, K3, K6; UAT test 1 passed (2026-10-14 retest) | closed |
| T-46-30 | Repudiation | `Transformers saved.` over a reverted list (WR-05) | medium | mitigate | copy-before-reread DeviceDetail.vue:358,483,523; throwing loader :314; :334,:339; K4 | closed (see R3) |
| T-46-31 | Information disclosure | Environment card after save | medium | mitigate | `saveEnvironment` never copies `parsed.value` into `this.device` DeviceDetail.vue:447-452; K4 | closed |
| T-46-32 | Tampering | store state mutated outside Vuex | low | mitigate | `Object.assign({}, this.device, …)` :358,:483,:523; no in-place mutation | closed |
| T-46-33 | Tampering | shared branches (46-06) | high | mitigate | console a16307a..31bce2b 2 commits `G`, 3 paths; parent 656bb9eb..6d47a5fb 9 commits `G`, gitlink only; fast-forward | closed |
| T-46-34 | Denial of service | production rollout (46-06) | high | mitigate | 46-06-SUMMARY preflight, pipeline 5672 OK, profile 401, port 7442 200, Legacy hashes OK; 46-VERIFICATION truth 14 | closed |
| T-46-35 | Information disclosure | verification probes (46-06) | medium | mitigate | status codes only; UAT test 7 (operator) passed | closed |
| T-46-36 | Repudiation | review findings closed without record | low | mitigate | 46-REVIEW-DISPOSITION.md:55,60 (CR-01, WR-05 → 31bce2b; `open: 8` listed) | closed |
| T-46-SC (×6 plans) | Tampering | npm/pip/cargo installs | low | mitigate | no package.json/lock change except the console `test:unit` chain | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-46-01 | T-46-06 | `redis.set` in apienv.js:45 has no callback, so a failed write is still answered `success: true`. Pre-existing, and outside D-02's scope: the operator limited the parent change to exact matching. The write stays a single `set`, so a failure never leaves a partial array. **Ratification pending:** 46-VERIFICATION.md:192 (WR-01) still asks for the operator's fix-or-accept decision. See residual R2. | plan-time (46-01-PLAN, D-02) | 2026-10-14 |
| AR-46-02 | T-46-11 | The usage count reads the owner's own device list, which the Devices page already shows. Only a count sentence is rendered (`V/src/utils/transformerUsage.js:7-35`). | plan-time (46-02-PLAN) | 2026-10-14 |
| AR-46-03 | T-46-28 | Without a session, the credential-free verification PUT/POST probes are refused by CSRF (403) before apienv runs, so they cannot write a variable. Recorded answers: PUT 403, POST 403. | plan-time (46-05-PLAN) | 2026-10-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Residuals (not counted in threats_open)

These are notes from the 2026-10-14 audit. None is open at or above `block_on: high`.

- **R1 (T-46-07; would be open at ASVS L2).** The single-target delete question in `Transformers.vue:117` (rendered in a plain `<p>` at :50) does not isolate the name. A name with a U+202E override can visibly reverse the end of the sentence, and B9 asserts it stays inside that sentence. Isolation exists only on the table cell and the list items. Impact is low: names are owner-scoped and the typed `confirm` is still required. Fix: wrap the name in `<bdi>`, or accept.
- **R2 (T-46-06).** The WR-01 decision is unrecorded. AR-46-01 does not cover the unchecked `redis.get` error at apienv.js:26-28: on a read error, `JSON.parse(undefined)` throws inside the callback, so the request hangs or the exception goes uncaught. Ratify and extend the acceptance, or schedule the fix.
- **R3 (T-46-30).** 46-06-REVIEW WR-01: when two Device Detail saves overlap and their re-reads return out of order, the old transformer list can show as saved, and a later Create & Assign writes it back. Pre-existing, not a 46-06 regression. K1..K6 are sequential and do not cover it.
- **R4 (pre-existing, no threat mapping).** 46-REVIEW WR-04: apienv.js:101 iterates a string `names` (router.env.js:60) character by character, which can delete variables with single-letter names. It affects the owner's own data only.
- **R5 (no threat mapping).** WR-03: secret values are trimmed without telling the user (Enviros.vue:134, :229). WR-02: `refreshAfter` (enviros.js:5-13) misses API-level refresh failures. Both are still open in 46-REVIEW-DISPOSITION.md.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-14 | 42 | 42 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-14
