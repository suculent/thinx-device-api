---
phase: "42"
slug: "ci-trim-login-page-build-footer"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 42 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Operator workstation → CircleCI API | Phase 43 bypass trigger (D-04 runbook) | personal CircleCI token (secret) |
| Git repo → CircleCI pipelines | `.circleci/config.yml` decides which jobs and contexts run per branch | job contexts: registry/Hub/Snyk credentials |
| CI build → Vue bundle | `vue.config.js` inlines build year and commit id | public build metadata |
| Browser → console.thinx.cloud | login page, OAuth hrefs, CSRF login flow | user credentials, OAuth redirects |
| Local checkout → shared `thinx-staging` | the push deploys API and Vue console to production | signed commits |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-42-01 | Information disclosure | runbook bypass snippet (D-04) | high | mitigate | `.planning/runbooks/legacy-console-build-gate.md`: token read with `read -rs`, sent via `--header @-`, `unset` after; no echo of the variable; checker sends no token | closed |
| T-42-02 | Denial of service | `.circleci/config.yml` | high | mitigate | `node scripts/check-ci-gates.js compile` (CircleCI compiler, both parameter values) OK; spec 22/22, now run in `test:node` and the CI `test` job (WR-01, `4e16212c`); pipeline 5655 green. MCP `validate_config` not run — same compiler endpoint | closed |
| T-42-03 | Elevation of privilege | monitor job contexts | medium | mitigate | `snyk-monitor-console-vue` / `-classic` contexts are `dockerhub` only (no `thinx-docker-repo`, no `console`) | closed |
| T-42-04 | Repudiation | Snyk coverage of deployed images | medium | accept | see Accepted Risks AR-42-01 | closed |
| T-42-05 | Tampering | `build_legacy_console` API trigger | low | accept | see Accepted Risks AR-42-02 | closed |
| T-42-06 | Spoofing | Login.vue OAuth hrefs and `login()` | high | mitigate | both OAuth `:href` bindings and `@submit.prevent="login"` present; Login.vue diff (`ff6e809..cfff199`) touches no `login()`, `fetchWithCsrf` or `oauthReturnQuery` line; `login-page.cjs` asserts the bindings | closed |
| T-42-07 | Tampering | AppFooter rendering env values | low | mitigate | no `v-html` in AppFooter.vue; year shown only if `/^\d{4}$/` and > 2018, id only if `/^[0-9a-f]{7}$/i` | closed |
| T-42-08 | Information disclosure | build id and year in the footer | low | accept | see Accepted Risks AR-42-03 | closed |
| T-42-09 | Tampering | logo asset | low | mitigate | `public/assets/thinx/img/logo_white_200.png` sha256-identical to the Legacy file; served live as 200 `image/png`; `test:csp:dist` passes | closed |
| T-42-10 | Spoofing | footer links with `target=_blank` | low | accept | see Accepted Risks AR-42-04 | closed |
| T-42-11 | Tampering | shared parent `thinx-staging` branch | high | mitigate | outgoing range checked (v1.18 / Phase 42 commits only, all signed); both pushes fast-forward; origin `main` unchanged (`b7881536`) | closed |
| T-42-12 | Repudiation | pushed commits | medium | mitigate | `%G?` = `G` on all 29 parent commits since `dec69991` and all 6 console commits `ff6e809..cfff199`; no hook bypass | closed |
| T-42-13 | Denial of service | production login after rollout | high | mitigate | preflight (console `test:unit`, gate spec, compile) before push; live bundle, logo and Legacy byte-identity checked after; rollback = revert of gitlink bump `2e018d7f`; operator accepted login UAT (H3) | closed |
| T-42-14 | Information disclosure | verification commands | medium | mitigate | CircleCI and production reads were unauthenticated GETs; no token used; SUMMARYs carry job names, hashes and status codes only | closed |
| T-42-SC | Tampering | npm/pip/cargo installs | low | mitigate | no dependency or lockfile change; only the `test:unit` / `test:node` script lines changed | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-42-01 | T-42-04 | CI-04 operator decision: images built on `thinx-staging` (what production runs) are Snyk-scanned only after `main` publishes the Hub copies; stale thinx-staging Snyk projects remain. Recorded in the runbook; 42-REVIEW WR-02 deferred. Revisit at CI-06 (Phase 48) | operator (plan-time decision, re-confirmed 2026-10-12) | 2026-10-12 |
| AR-42-02 | T-42-05 | Only project members with a personal token can trigger a pipeline; the bypass builds the legacy image from the committed branch, no new privilege | operator (plan-time) | 2026-10-12 |
| AR-42-03 | T-42-08 | The 7-char id of a public open-source repo is already in the bundle as Rollbar `code_version`; only year and id are rendered | operator (plan-time) | 2026-10-12 |
| AR-42-04 | T-42-10 | Footer links point at the operator's own console and landing hosts, unchanged by this phase; current browsers apply `noopener` to `target=_blank` | operator (plan-time) | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 15 | 15 | 0 | gsd-secure-phase orchestrator (ASVS L1 grep-depth, plan-time register; short-circuit, no auditor spawn) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12
