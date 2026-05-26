# Dependency Triage — Phase 4 (SEC-DEP-01)

Baseline captured: 2026-05-26 (commit SHA inserted at slice close)

Scope: All open Dependabot alerts against `suculent/thinx-device-api` as of slice-open time.

## Triage table

| Alert URL | Package | GHSA ID | Severity | Scope | Direct/Transitive | Vuln range / installed | Verdict | Rationale | Future trigger |
|-----------|---------|---------|----------|-------|-------------------|------------------------|---------|-----------|----------------|
| https://github.com/suculent/thinx-device-api/security/dependabot/168 | lodash | GHSA-r5fr-rjxr-66jc | high | runtime | via jshint > lodash and via rollbar/winston/fs-finder > async > lodash | >= 4.0.0, <= 4.17.23 / installed: 4.17.23 | blocker | Active via jshint + rollbar + winston + fs-finder chains; fix = bump override 4.17.23 -> 4.18.1 | — |
| https://github.com/suculent/thinx-device-api/security/dependabot/146 | minimatch | GHSA-7r86-cg39-jmmj | high | runtime | via jshint > minimatch (and via jshint > cli > glob > minimatch) | >= 5.0.0, < 5.1.8 / installed: 5.1.0 | blocker | Active via jshint runtime chain; fix = bump override 5.1.0 -> 5.1.9 | — |
| https://github.com/suculent/thinx-device-api/security/dependabot/145 | minimatch | GHSA-23c5-xmqv-rm74 | high | runtime | via jshint > minimatch (and via jshint > cli > glob > minimatch) | >= 5.0.0, < 5.1.8 / installed: 5.1.0 | blocker | Active via jshint runtime chain; fix = bump override 5.1.0 -> 5.1.9 | — |
| https://github.com/suculent/thinx-device-api/security/dependabot/144 | minimatch | GHSA-3ppc-4f35-3m26 | high | runtime | via jshint > minimatch (and via jshint > cli > glob > minimatch) | >= 5.0.0, < 5.1.7 / installed: 5.1.0 | blocker | Active via jshint runtime chain; fix = bump override 5.1.0 -> 5.1.9 | — |
| https://github.com/suculent/thinx-device-api/security/dependabot/171 | follow-redirects | GHSA-r4q5-vmmm-2653 | medium | runtime | via axios (also via nano, mailgun.js, @slack/web-api) > follow-redirects | <= 1.15.11 / installed: 1.15.6 | blocker | Active CVE in production code path; fix = remove override line (axios@1.16.1 declares ^1.16.0 natively) | — |
| https://github.com/suculent/thinx-device-api/security/dependabot/167 | lodash | GHSA-f23m-r3pf-42rh | medium | runtime | via jshint > lodash and via rollbar/winston/fs-finder > async > lodash | <= 4.17.23 / installed: 4.17.23 | blocker | Active via jshint + rollbar + winston + fs-finder chains; fix = bump override 4.17.23 -> 4.18.1 | — |
| https://github.com/suculent/thinx-device-api/security/dependabot/193 | ws | GHSA-58qx-3vcg-4xpx | medium | runtime | via socket.io > engine.io > ws and via socket.io-client > engine.io-client > ws and via socket.io > socket.io-adapter > ws | >= 8.0.0, < 8.20.1 / installed: 8.20.1 (top) / 8.17.1 (nested in engine.io chain) | blocker | Active via socket.io builder<->worker chain (engine.io tilde-lock ~8.17.1); fix = add override ws: 8.20.1 | — |
| https://github.com/suculent/thinx-device-api/security/dependabot/192 | fast-uri | GHSA-v39h-62p7-jpjc | high | development | via ajv chain (dev-only) | <= 3.1.1 / installed: 3.1.2 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/191 | fast-uri | GHSA-q3j6-qgpj-74h6 | high | development | via ajv chain (dev-only) | <= 3.1.0 / installed: 3.1.2 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/185 | axios | GHSA-pf86-5x62-jrwf | high | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/184 | axios | GHSA-6chq-wfr3-2hj9 | high | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/181 | axios | GHSA-pmwg-cvhr-8vh7 | high | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/179 | axios | GHSA-q8qp-cvcw-x6jj | high | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.2 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/147 | serialize-javascript | GHSA-5c6j-r48x-rmvq | high | development | via mocha > serialize-javascript (devDependencies; stripped by Dockerfile L86 npm install --omit=dev) | <= 7.0.2 / installed: 6.0.2 | deferred-dev-only | dev-only-scope | If mocha or nyc usage moves into a runtime code path |
| https://github.com/suculent/thinx-device-api/security/dependabot/195 | serialize-javascript | GHSA-qj8w-gfj5-8c6v | medium | development | via mocha > serialize-javascript (devDependencies; stripped by Dockerfile L86 npm install --omit=dev) | >= 5.0.0, < 7.0.5 / installed: 6.0.2 | deferred-dev-only | dev-only-scope | If mocha or nyc usage moves into a runtime code path |
| https://github.com/suculent/thinx-device-api/security/dependabot/194 | uuid | GHSA-w5hq-g745-h8pq | medium | development | via nyc > istanbul-lib-processinfo > uuid and via jest-junit > uuid (devDependencies; stripped by Dockerfile L86) | < 11.1.1 / installed: 8.3.2 (nested in nyc/jest-junit; top-level uuid is 14.0.0) | deferred-dev-only | dev-only-scope | If mocha or nyc usage moves into a runtime code path |
| https://github.com/suculent/thinx-device-api/security/dependabot/190 | axios | GHSA-445q-vr5w-6q77 | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/189 | axios | GHSA-m7pr-hjqh-92cm | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/188 | axios | GHSA-62hf-57xw-28j9 | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/187 | axios | GHSA-5c9x-8gcm-mpgx | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/186 | axios | GHSA-vf2m-468p-8v99 | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/183 | axios | GHSA-xx6v-rp6x-q39c | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/182 | axios | GHSA-w9j2-pvgh-6h63 | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/180 | axios | GHSA-3w6x-2g7m-8v23 | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.2 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/173 | axios | GHSA-3p68-rc4w-qgx5 | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.0 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/172 | axios | GHSA-fvcv-3m26-pcqx | medium | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.0 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/177 | ip-address | GHSA-v2v4-37r5-5v8g | medium | runtime | direct (via nano > smtp / address parse helpers — also via various transitives) | <= 10.1.0 / installed: 10.2.0 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/176 | uuid | GHSA-w5hq-g745-h8pq | medium | runtime | direct (package.json dependencies: uuid ^14.0.0) | >= 13.0.0, < 13.0.1 / installed: 14.0.0 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |
| https://github.com/suculent/thinx-device-api/security/dependabot/178 | axios | GHSA-xhjh-pmcv-23jw | low | runtime | direct (package.json dependencies: axios ^1.16.0) | >= 1.0.0, < 1.15.1 / installed: 1.16.1 | deferred-stale | stale-alert | Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days |

**Total rows:** 29 (7 blocker / 19 deferred-stale / 3 deferred-dev-only)

## Fix log

| Commit SHA | Files changed | Override delta | Alerts closed (GHSA IDs) | Verification |
|------------|---------------|----------------|---------------------------|--------------|
| d8e3176c | package.json, package-lock.json | -follow-redirects: 1.15.6; lodash: 4.17.23 -> 4.18.1; minimatch: 5.1.0 -> 5.1.9; +ws: "$ws" (self-ref; resolves to 8.21.0 at all 6 instances; deviation A from plan's bare "8.20.1" because ws is also a direct dep — npm EOVERRIDE) | GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26, GHSA-r4q5-vmmm-2653, GHSA-58qx-3vcg-4xpx | CI green on d8e3176c (build 13852 `test` PASS + 13853 `build-api-cloud` PASS + 13851 `build-vue-console` PASS); rtm `Bearer null` -> 200 (`password_reset_request_accepted`); runtime-tree high=0 per 04-AUDIT-POST-PROD-PROVISIONAL.json (was 9 pre-fix); autoredeploy delta=49s (image publish 22:35:05Z -> task Running 22:35:54Z; Phase 3 baseline 63s); new image sha256:4d3fb789 |

## Post-fix baseline

### Captured at

_(filled in by Slice 3)_

### Metric snapshot

| Metric | Value |
|--------|-------|

### Deferred alerts (open by design)

_(filled in by Slice 3 — list of GHSA IDs that remain open with rationale class)_

### Artifact references

- `.planning/phases/04-dependency-triage/04-AUDIT-PRE.json` (pre-fix full tree)
- `.planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json` (pre-fix runtime tree)
- `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (pre-fix Dependabot enumeration)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST.json` (placeholder — filled by Slice 3)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROD.json` (placeholder)
- `.planning/phases/04-dependency-triage/04-DEPENDABOT-POST.json` (placeholder)

## Rationale taxonomy (closed set)

- `dev-only-scope` — Package is in `devDependencies` AND production Docker image is built with `npm install --omit=dev` (Dockerfile L86). No production exploit surface.
- `stale-alert` — Live `package-lock.json` resolves to a version beyond the alert's `vulnerable_version_range`. Alert will auto-dismiss after next Dependabot scan; may be manually dismissed via UI.
- `chai-http-lock` — Fix would require bumping chai-http to v5 (ESM-only); blocked per AGENTS.md L82-92. Reserved for future; no 2026-05-26 alert triggers this class.
- `transitive-uncontrollable` — Vulnerable transitive cannot be overridden without breaking the parent (e.g., parent has hard peer dep on vulnerable range). Rare; none in current set.
- `low-severity-high-cost` — Low or medium severity AND fix cost would be HIGH (lib/ changes or major-version bumps). None in current set.
- `mitigated-by-config` — Vulnerable surface is gated by configuration not enabled in production (e.g., a feature flag is off). Requires explicit documented config check. None in current set.

## Verdict enum (closed set)

- `blocker`
- `deferred-stale`
- `deferred-dev-only`
- `deferred-locked`
- `deferred-cost`
- `deferred-low-sev`

Note: Every row in Section 1 MUST have its Verdict column drawn from this set, and every `deferred-*` row MUST cite exactly one class from Section 4 (Rationale taxonomy) in its Rationale column.
