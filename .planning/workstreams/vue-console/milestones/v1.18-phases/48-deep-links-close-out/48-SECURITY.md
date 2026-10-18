---
phase: "48"
slug: "deep-links-close-out"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-17"
---

# Phase 48 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser to console (Vue and Legacy) | Deep-link reload, session hydration, build and deploy-key actions | Session token, CSRF token, API reasons rendered as text |
| CI to CircleCI and production images | Cypress gate, image build and publish, shared thinx-staging branches | Source, test results, image tags; no credentials in the test job |
| Cypress to dev-server proxy | Unstubbed requests can reach https://console.thinx.cloud | Test traffic only; blockHosts and a catch-all stub limit it |
| Legacy device ports | Plaintext 7442 and plain MQTT stay open by operator decision | Not changed by this phase |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-48-01 | Elevation of privilege | Deep-link reload of protected /app/* | medium | mitigate | Router guard hydrates then redirects to /login when unauthenticated; App.vue waits for the initial route (Routes.js:149-155, App.vue:50-60, unit A4, deep-link.spec.js) | closed |
| T-48-02 | Tampering | /oauth-return force prime | medium | mitigate | forcePrime only for /oauth-return; cookies.js unchanged (App.vue:53, store/auth.js:73-81, unit A5, oauth-return.spec.js) | closed |
| T-48-03 | Denial of service | App.vue waits forever for the initial route | low | mitigate | router.onReady(done, done) resolves on success and error (App.vue:37-42, units A1/A6) | closed |
| T-48-04 | Denial of service | Undefined response after IN-01 | low | mitigate | parseResult returns undefined when the data key is absent (core/api.js:70-79, units I1-I8) | closed |
| T-48-SC (48-01) | Tampering | npm/pip/cargo installs | low | mitigate | No dependency or lock-file change in the plan | closed |
| T-48-05 | Information disclosure | test-vue-console runs third-party install scripts | medium | mitigate | Job has no context and no docker auth (config.yml:269,977; CiPipelineGates.test.js:290-303) | closed |
| T-48-06 | Denial of service | Invalid config stops every pipeline | high | mitigate | Spec 30/30, YAML parses, CircleCI compiled it for pipeline 5678 (6/6 jobs success) | closed |
| T-48-07 | Tampering | Vue image from an untested commit | medium | mitigate | vue-console-registry requires test-vue-console (config.yml:992-993,1007-1008); gate held in pipeline 5676 | closed |
| T-48-08 | Repudiation | Kill switch or CI-04 weakened | low | mitigate | build_legacy_console boolean parameter with spec coverage (config.yml:16-19,1147) | closed |
| T-48-SC (48-02) | Tampering | Installs | low | mitigate | No dependency or lock-file change; spec uses installed yaml | closed |
| T-48-09 | Denial of service | Repeated POST /build | medium | mitigate | buildPending disables the button, early return, reset in finally (DeviceDetail.vue:17,381,387-394; units F3/F4; device-detail.spec.js) | closed |
| T-48-10 | Tampering | API or device text rendered as markup (XSS) | high | mitigate | No v-html/domProps/html tooltips in vue/src; reasons render as text (units F5/F8) | closed |
| T-48-11 | Tampering | udid-based element ids | low | mitigate | Bound :id only; no dynamic querySelector (Devices.vue:90,94,226,230) | closed |
| T-48-12 | Information disclosure | Focus ring and tips | low | accept | Only three fixed tip strings, no new data (Devices.vue:115-137) | closed (accepted) |
| T-48-SC (48-03) | Tampering | Installs | low | mitigate | No dependency change | closed |
| T-48-13 | Tampering | Toastr bodies from reply data (Legacy) | high | mitigate | Fixed copy, reason codes mapped to sentences, frames escaped (DevicesController.js:117-147, DeploykeyController.js, LogviewController.js; D9/G2/G8/G9, toast-escape.cjs) | closed |
| T-48-14 | Tampering | .msg-warning written with an object or HTML | medium | mitigate | .text(sentence) only (DeploykeyController.js:69; D5/D9) | closed |
| T-48-15 | Information disclosure | {init} subscription | low | accept | Client sends only the owner id it holds; server ignores it and uses the verified owner (socket_session.js:94-98) | closed (accepted) |
| T-48-16 | Denial of service | Create stuck disabled or frame handler throws | low | mitigate | finally/always reset, readyState guard (DeploykeyController.js:115,129; LogviewController.js:143,232; D8/G3/G6) | closed |
| T-48-SC (48-04) | Tampering | Installs | low | mitigate | No dependency change | closed |
| T-48-17 | Information disclosure | Real-API login from CI with the leaked fixture | high | mitigate | No fixture import; live login only with CYPRESS_LIVE_LOGIN=1; login.spec.js stubbed (credentials.js, login.spec.js:10-60) | closed |
| T-48-18 | Information disclosure | Tracked legacy Cypress env file | high | mitigate | Untracked and ignored (.gitignore:11, commit 44a9db6); operator inspected, no real credential (48-UAT item 10) | closed |
| T-48-19 | Tampering | Specs reaching production via the dev-server proxy | medium | mitigate | Catch-all 500 for /api/v2/, blockHosts, admin spec gated (api-stubs.js:55-60, cypress.json:12); residual IN-02 info | closed |
| T-48-20 | Repudiation | Suite made green by skipping specs | medium | mitigate | 77 results, 10 skipped, matching the SUMMARY; store_test_results on (config.yml:289-290) | closed |
| T-48-SC (48-05) | Tampering | Installs | low | mitigate | No dependency change; in-repo JUnit reporter uses Node built-ins | closed |
| T-48-21 | Tampering | Shared parent thinx-staging branch | high | mitigate | 70 signed non-merge commits, allow-listed paths, fast-forward only, main unchanged | closed |
| T-48-22 | Tampering | Console thinx-staging branch | medium | mitigate | 31 signed non-merge commits, Phase 48 paths only, fast-forward push | closed |
| T-48-23 | Denial of service | Production after rollout | high | mitigate | Pipelines 5677/5678 green, live 200/401 probes, kill switch kept | closed |
| T-48-24 | Repudiation | Phase 35 ledger | medium | mitigate | 35-REVIEW-DISPOSITION 16 rows, open 0, cited SHAs signed ancestors | closed |
| T-48-25 | Information disclosure | Verification probes and evidence | medium | mitigate | Unauthenticated probes only; no tokens or cookies in phase records | closed |
| T-48-26 | Denial of service | Legacy devices on port 7442 / plain MQTT | high | mitigate | No edge or API change in the phase; baseline 200 recorded in 48-06-SUMMARY | closed |
| T-48-SC (48-06) | Tampering | Installs | low | mitigate | No install | closed |
| T-48-27 | Repudiation | In-repo JUnit reporter hiding failures | medium | mitigate | Every case recorded without de-duplication (junit.js:208; J1/J4) | closed |
| T-48-28 | Denial of service | CI gate crash from a reporter error | high | mitigate | Per-event guard and write() fully in try/catch (junit.js:156,175,231; R0/J2/J6) | closed |
| T-48-29 | Tampering | CI depends on external hosts | low | mitigate | blockHosts for fonts and gvt1 (cypress.json:12) | closed |
| T-48-30 | Information disclosure | JUnit, screenshots and logs as public artifacts | low | mitigate | Stubs, forged JWTs and fixtures only | closed |
| T-48-31 | Tampering | Shared parent branch | high | mitigate | Gitlink-only signed commits, not merges | closed |
| T-48-32 | Denial of service | Production after the push | high | mitigate | Pipelines green; red gate held the Vue image in 5676 | closed |
| T-48-SC (48-07) | Tampering | Installs | low | mitigate | No dependency change | closed |
| T-48-33 | Repudiation | deep-link.spec.js / support weakened | high | mitigate | No removed lines, no skip/only/retries; #/login assertion kept | closed |
| T-48-34 | Denial of service | Flake returns and blocks the Vue deploy | high | mitigate | Root cause fixed in core/api.js:97-123; 20/20 red before, 0/20 after, 55/55 consecutive; job 16080 4/4 | closed |
| T-48-35 | Information disclosure | Test traffic leaks to production via dev proxy | low | mitigate | Spec awaits all dashboard reads; general hazard tracked as follow-up (IN-02) | closed |
| T-48-36 | Tampering | Api.request() error handling masks CSRF or auth failures | medium | mitigate | fetch/fetchWithCsrf unchanged; networkError separates transport failure from refusal (unit I9-I13) | closed |
| T-48-37 | Tampering | Shared parent branch | high | mitigate | Gitlink-only signed commit, main unchanged | closed |
| T-48-38 | Denial of service | Production after the push | high | mitigate | Pipelines green, live probes | closed |
| T-48-39 | Information disclosure | Traces, screenshots, CI output | low | mitigate | Stubs and forged JWTs; no secrets in phase records | closed |
| T-48-SC (48-08) | Tampering | Installs | low | mitigate | No dependency change | closed |

*Audited at console 13b71be, parent 65daf12c, ASVS level 1 (presence check at the cited boundary), block_on high. 47 threats: 39 numbered plus one T-48-SC supply-chain row per plan. 45 mitigate, 2 accept, 0 transfer. 15 high, 13 medium, 19 low.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-48-01 | T-48-12 | Focus ring and tips show only three fixed strings; no hidden data | Plan 48-03 | 2026-10-17 |
| AR-48-02 | T-48-15 | Legacy {init} subscription carries only the owner id the page already holds; the server ignores it and routes by the verified owner | Plan 48-04 | 2026-10-17 |
| AR-48-03 | T-48-18 (residual) | Old src/cypress env file stays in the public console repo history; history rewrite deferred. Operator inspected it: no real credential, no rotation needed (48-UAT item 10) | Plan 48-05 D-05, operator | 2026-10-17 |

*Accepted risks do not resurface in future audit runs.*

**Non-blocking carry-overs (info, not threats):** review items IN-01 to IN-07 remain open in 48-REVIEW-DISPOSITION.md. IN-02 (dev-server proxy forwards unstubbed non-/api/v2 requests and the opt-in live login) is the one relevant to T-48-19 and T-48-35. Unpushed commits 13b71be (console) and 65daf12c (parent) narrow credential exposure and weaken no mitigation.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-17 | 47 | 47 | 0 | gsd-security-auditor (/gsd-secure-phase 48) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-17 (auditor verdict SECURED)
