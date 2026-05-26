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

2026-05-26T22:50:37Z (Slice 3 close-out timestamp). Lockfile provenance: `package.json` + `package-lock.json` last touched in commit `d8e3176c` (Slice 2 — `chore(deps): SEC-DEP-01 - resolve 7 active alerts via overrides`). `npm audit` re-run is read-only against that lockfile; no `npm install` performed in Slice 3.

**Operator decision 2026-05-27: Option C — proceed with documentation now; document rescan-pending residual (29 open Dependabot alerts; expected auto-resolution within ~24h; runtime-tree npm audit high=0 is the authoritative primary metric).** Skipped the manual Dependabot UI dismissal walk; the 7 blocker alerts (#168, #167, #146, #145, #144, #171, #193) will auto-close on next GitHub rescan (typical latency 1–6h after lockfile change on `thinx-staging`; upper bound ~24h). The 22 non-blocker alerts (19 deferred-stale + 3 deferred-dev-only from Slice 1's triage) are LEFT OPEN per the operator's decision — they may be dismissed in a follow-up pass or left to age out via natural Dependabot lifecycle. Phase 4 close-out does not gate on the Dependabot UI count reaching 0; the primary metric is the runtime-tree audit (verified high=0).

### Metric snapshot

| Metric | Pre-fix | Post-fix | Delta |
|--------|---------|----------|-------|
| Runtime tree (`npm audit --omit=dev`) — high | 9 | **0** | **-9** ← Phase 4 primary success metric |
| Runtime tree — moderate | 6 | 0 | -6 |
| Runtime tree — low | 0 | 0 | 0 |
| Runtime tree — total | 15 | 0 | -15 |
| Full tree (`npm audit`) — high | 23 | 1 | -22 |
| Full tree — moderate | 11 | 7 | -4 |
| Full tree — low | 0 | 0 | 0 |
| Full tree — total | 34 | 8 | -26 |
| Dependabot open alerts — total | 29 | 29 | 0 (rescan pending; see note) |
| Dependabot open — high severity | 11 | 11 | 0 (rescan pending; see note) |
| Dependabot open — medium severity | 17 | 17 | 0 (rescan pending; see note) |
| Dependabot open — low severity | 1 | 1 | 0 (rescan pending; see note) |

**Note on the 8-row full-tree residual (1H + 7M):** these are devDep-only carriers (chains rooted in mocha / nyc / jest-junit / ajv — all stripped by `Dockerfile` L86 `npm install --omit=dev`). They do NOT reach the production image and do NOT contribute to the runtime-tree count. Slice 1's `dev-only-scope` rationale class covers them.

**Note on the Dependabot delta = 0:** GitHub Dependabot rescans the repository after a lockfile change on default branches; `thinx-staging` is not currently the default branch (`master` is), so the rescan is anchored to the next default-branch surface. Slice 4 (merge-up PR `thinx-staging → master`) is the event that propagates the lockfile change into Dependabot's rescan input. The 7 blocker alerts (see "Auto-close-imminent" bucket below) will close on that rescan; the 22 non-blocker alerts remain per operator decision.

### Open-alert bucket classification (29 alerts)

Per the operator's Option C decision, the 29 open alerts are classified into three buckets — none were manually dismissed in this slice.

#### Bucket A — Auto-close-imminent (7 alerts) — Slice 2's fix shipped; rescan pending

These 7 alerts map 1:1 to Slice 1's `blocker`-verdict triage rows. The lockfile shipped in commit `d8e3176c` resolves each — verified via runtime-tree `npm audit --omit=dev` returning high=0 + total=0 against the deployed lockfile. They are expected to auto-close on the next GitHub Dependabot rescan (typical latency 1–6h after lockfile reaches default branch; upper bound ~24h). Slice 4 (merge-up PR) is the event that exposes the new lockfile to the rescan.

- **#168** GHSA-r5fr-rjxr-66jc lodash high → resolved by lodash 4.17.23 → 4.18.1 override (resolves at all 6 instances)
- **#167** GHSA-f23m-r3pf-42rh lodash medium → resolved by same lodash override
- **#146** GHSA-7r86-cg39-jmmj minimatch high → resolved by minimatch 5.1.0 → 5.1.9 override
- **#145** GHSA-23c5-xmqv-rm74 minimatch high → resolved by same minimatch override
- **#144** GHSA-3ppc-4f35-3m26 minimatch high → resolved by same minimatch override
- **#171** GHSA-r4q5-vmmm-2653 follow-redirects medium → resolved by removing the `follow-redirects` pin (axios@1.16.1's own `^1.16.0` declaration resolves to 1.16.0, past the patched range)
- **#193** GHSA-58qx-3vcg-4xpx ws medium → resolved by `ws: "$ws"` self-reference override (resolves to 8.21.0 at all 6 instances; past the 8.20.0 patched-line start)

#### Bucket B — Dismissable-with-notes (19 alerts) — `deferred-stale` (installed past vuln range)

These alerts target package ranges that the live `package-lock.json` already resolves PAST (Slice 1's `deferred-stale` rationale). The advisories are stale relative to the deployed state; they will auto-clear on Dependabot rescan, OR can be manually dismissed via the UI with reason "Fixed in newer version". Per operator Option C decision, no manual dismissal performed this slice — alerts left to age out.

axios (15 alerts; runtime; installed 1.16.1 past all listed `<= 1.15.x` ranges):
- **#185** GHSA-pf86-5x62-jrwf high; **#184** GHSA-6chq-wfr3-2hj9 high; **#181** GHSA-pmwg-cvhr-8vh7 high; **#179** GHSA-q8qp-cvcw-x6jj high
- **#173** GHSA-3p68-rc4w-qgx5 medium; **#180** GHSA-3w6x-2g7m-8v23 medium; **#190** GHSA-445q-vr5w-6q77 medium; **#187** GHSA-5c9x-8gcm-mpgx medium; **#188** GHSA-62hf-57xw-28j9 medium; **#172** GHSA-fvcv-3m26-pcqx medium; **#189** GHSA-m7pr-hjqh-92cm medium; **#186** GHSA-vf2m-468p-8v99 medium; **#182** GHSA-w9j2-pvgh-6h63 medium; **#183** GHSA-xx6v-rp6x-q39c medium
- **#178** GHSA-xhjh-pmcv-23jw low

fast-uri (2 alerts; development; installed 3.1.2 past `<= 3.1.1` range):
- **#192** GHSA-v39h-62p7-jpjc high; **#191** GHSA-q3j6-qgpj-74h6 high (scope is `development` per gh api; carried via ajv chain)

ip-address (1 alert; runtime; installed 10.2.0 past `<= 10.1.0` range):
- **#177** GHSA-v2v4-37r5-5v8g medium

uuid (1 alert; runtime; installed 14.0.0 past `< 13.0.1` range):
- **#176** GHSA-w5hq-g745-h8pq medium

#### Bucket C — Dev-only-deferred (3 alerts) — `deferred-dev-only` (production image strips)

These alerts target devDependencies that are stripped from the production image by `Dockerfile` L86 (`npm install --omit=dev`). They never reach the production runtime path. Trigger to revisit: if mocha / nyc usage moves into a runtime code path (none planned for v1).

- **#147** GHSA-5c6j-r48x-rmvq serialize-javascript high (via mocha)
- **#195** GHSA-qj8w-gfj5-8c6v serialize-javascript medium (via mocha)
- **#194** GHSA-w5hq-g745-h8pq uuid medium (development scope — via nyc > istanbul-lib-processinfo and via jest-junit; same GHSA as #176 but a different alert because the chain is dev-only here)

### Deferred alerts (open by design)

Per operator Option C decision, NO alerts were manually dismissed in this slice. All 29 alerts remain open in the GitHub Security tab; the 7 in Bucket A will auto-close on rescan, the 22 in Buckets B + C are left open by design with the rationale class noted above (Bucket B = `stale-alert`; Bucket C = `dev-only-scope`). Cross-reference for each alert's verdict / rationale / future-trigger: Section 1 (Triage table) row for that GHSA.

### Artifact references

- `.planning/phases/04-dependency-triage/04-AUDIT-PRE.json` (pre-fix full tree)
- `.planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json` (pre-fix runtime tree)
- `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (pre-fix Dependabot enumeration; 29 alerts)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST.json` (post-fix full tree; 8 = 1H + 7M devDep-only residue)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROD.json` (post-fix runtime tree; 0 = primary metric ✓)
- `.planning/phases/04-dependency-triage/04-DEPENDABOT-POST.json` (post-fix Dependabot enumeration; 29 alerts — rescan pending)
- Provisional capture artifacts from Slice 2 (`04-AUDIT-POST-PROVISIONAL.json`, `04-AUDIT-POST-PROD-PROVISIONAL.json`) were verified byte-equivalent to the authoritative captures above (`jq -S .metadata.vulnerabilities` diff returned empty for both pairs); they have been removed in this slice to keep the repo clean per plan's read-first guidance — the authoritative `*POST*.json` files supersede them.

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
