---
phase: "44"
slug: "device-list-parity"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-13"
---

# Phase 44 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| API → browser (device list) | GET /device returns fields written by device check-in, registration and owner edits; all untrusted for rendering | `platform`, `icon`, `status`, `firmware`, `keyhash`, `source`, `last_build_id` |
| API → browser (repository list) | GET /source returns the platform found by repository analysis | repository `platform` string (often `unknown_platform`) |
| browser → API (build, build log) | Build sends POST /build through the existing `$api` client; View log reads `/logs/build/<id>` | `udid`, `source_id`, build id |
| bundled assets → browser | device symbols and the icomoon font ship inside the console bundle as `data:` URIs under the unchanged CSP | PNG and font bytes |
| local branches → origin `thinx-staging` | the console branch and the shared parent branch reach production through CircleCI and Swarmpit | signed commits, parent gitlink |
| CircleCI → private registry → swarm | the push pipeline builds and publishes the API and Vue images that Swarmpit rolls out | images |
| executor / auditor → production, CircleCI, GitHub | unauthenticated GETs only | public bundle, Legacy files, job list, branch heads |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-44-01 | Tampering | PlatformBullet, device tile and platform pills rendering a device-supplied `platform` | medium | mitigate | `utils/platforms.js:25-28` `basePlatform` maps any input onto one of nine fixed keys through an own-property check, else `unknown` (so `__proto__` and `constructor` also fall back); `:31-39` the label comes from the fixed map; `PlatformBullet.vue:2` renders only `info.label` and `'platform-' + info.key`; `Devices.vue:83-87` and `:155-160` build tile class, title and alt from `platformOf()` (`:358`); pills `:304-313` take key and label from the map and `data-cy` from the key (`:36`); the raw string is only ever a prop (`Devices.vue:90`, `:164`, `Repositories.vue:28`); `v-html` 0 in all five templates, no `innerHTML` or `domProps`; `device-list-parity.cjs` `:226`, `:240-259`, `:272-285`, `:402`, `:640-645` feed `esp-idf:foo`, `unknown_platform`, null, 42, `{}`, `[]` and pass (auditor re-run 52 ok / 0 FAIL) | closed |
| T-44-02 | Tampering | `symbolSrc(device.icon)` | low | mitigate | `Devices.vue:269` `require.context('@/assets/thinx/ioticons', false, /^\.\/b_medium_\d\d\.png$/)`: no subdirectories, only `b_medium_NN.png`; `:360-364` the key is built only from a `parseInt` integer in 1..73, padded, else `01`; `ioticons/` holds `b_medium_01..73` with no gap (73 files), so every key resolves; checks `:683-684`, `:747` cover 7, '12', 73, 0, 74, 'x', null and a missing icon | closed |
| T-44-03 | Denial of service | Devices page render on malformed device data | low | mitigate | `platforms.js:31-39` `platformInfo` wraps `basePlatform` in try/catch and always returns a map entry; symbol fallback `Devices.vue:362`; the test harness records Vue warnings and render errors (`device-list-parity.cjs:26`, `:104-113`) and the page checks assert none (`:398`, `:611`, `:625`); console `test:unit` 198 ok / 0 FAIL (auditor re-run). See Auditor Note N-1 | closed |
| T-44-04 | Information disclosure | List.vue slot change on Enviros, Channels and Apikeys | low | mitigate | `List.vue:35-37` is the only List change since `cfff199`: the default slot content is the previous `{{ item[header.prop] }}`; the only `#cell(` user in `vue/src` is `Repositories.vue:28`; Enviros, Channels, Apikeys and `vue/src/store` unchanged since `cfff199`; the no-slot check `device-list-parity.cjs:606-614` renders the raw values | closed |
| T-44-05 | Tampering | status and firmware rendering (device-supplied text) | high | mitigate | text interpolation and bound attributes only: status `Devices.vue:103`, `:177` (`{{ statusText() }}`, `:title="statusTitle()"`), firmware `:91`, `:165` (`{{ device.firmware \|\| '—' }}`, `:title`); `v-html` 0 in Devices.vue and IconButton.vue, also asserted in-test (`:285`, `:370`, `:1330`); `cleanStatus` `:367-375` drops code < 32 and 127 with a `charCodeAt` loop, and the file holds no control escape or regex (`\x0`, `\x1`, `\u000`, `\u001` all 0); `statusText` `:377-381` cuts at 22 characters plus U+2026; the `#e`/`#w` markers test the cleaned text (`:386-387`) and render fixed copy. Firmware is not stripped (the plan scopes `cleanStatus` to status), but it only reaches a text node and a `title` attribute, which carry no markup. Checks `:1171-1196`, `:1254-1255`, `:1311-1319` (tab, BEL, DEL, US, NUL, 200-character status, 120-character firmware) pass | closed |
| T-44-06 | Denial of service | Build action double-submit | medium | mitigate | `Devices.vue:403-410` `buildAction` is disabled while `buildingUdids` holds the udid; `buildDevice` `:412-426` returns for a disabled state and pushes the udid in the same synchronous step (no `await` between check and push), turns a rejection into `{ success: false }` and releases the udid in `finally`; `IconButton.vue:27-30` emits nothing while disabled; payload `{ udid, source_id }` and `store/devices.js` unchanged; `checkAsync` `device-list-parity.cjs:1048-1074` (one request for two clicks, released after success, failure, `{ success: false }` and rejection) passes | closed |
| T-44-07 | Tampering | Revoke as an icon button | medium | mitigate | `revokeRow` (`Devices.vue:491-506`) and `confirmRevoke` (`:434-448`) are byte-identical to `cfff199` (auditor diff of the extracted blocks), as are the bulk Revoke / Transfer / Push Config buttons (`:10-20`) and both modals; Revoke is a `variant="danger"` IconButton in the table only (`:137`; the grid action row `:195-220` has none); check `:1089-1105` asserts the 'Confirm Revoke' dialog | closed |
| T-44-08 | Spoofing | View log for a device-supplied `last_build_id` | low | mitigate | `Devices.vue:427-433` `hasBuild` requires a non-empty trimmed string and `openLastBuild` returns otherwise; `store/buildlog.js:61` `'/logs/build/' + encodeURIComponent(buildId)`; API `lib/router.logs.js:54-70` takes the owner from the session (`sanitka.owner(req.session.owner)`), sanitises the id (`sanitka.udid`) and reads through `blog.fetchOwned(build_id, owner)`; `BuildLogDialog.vue:2`, `:5` render the id and the log as text | closed |
| T-44-09 | Tampering | icomoon font asset | low | mitigate | `cmp`: `vue/src/fonts/icomoon/icomoon.woff` and `.ttf` identical to Legacy `src/assets/thinx/fonts/` (sha256 `38824876…56ab`, `3bb1b357…2f94`), Legacy fonts unchanged in range; `_icomoon.scss:7-26` holds the font face and only `.icomoon-hammer_icon`; `theme.scss:15` one import; `vue/default.conf` (CSP, `default-src … data:`) unchanged since `cfff199`; `test:csp:dist` PASS (auditor re-run on the `6a34102` dist) | closed |
| T-44-10 | Tampering | shared parent `thinx-staging` branch | high | mitigate | auditor re-check of `4fcacece..d630652e`: 11 commits, all `%G?` = `G`, 0 merges, fast-forward (`4fcacece` is an ancestor); the only path outside `.planning/` is `services/console`; the gitlink at `d630652e` is `6a34102c`; `8bdf69b0` (vault-transit) is `.planning/` only; public GitHub API: parent `thinx-staging` = `d630652e`, `main` = `14c08c1f` (unchanged); the two later local commits `810100ea` and `c9a79639` are `.planning/` only, signed and unpushed | closed |
| T-44-11 | Tampering | console `thinx-staging` branch | medium | mitigate | `cfff199..6a34102`: 12 commits, all `G`, exactly the 13 phase paths, no Legacy `src/` diff, fast-forward (`cfff199` is an ancestor); public GitHub API: console `thinx-staging` = `6a34102`, console `main` = `a0e86707` | closed |
| T-44-12 | Denial of service | production Vue console after rollout | high | mitigate | preflight (test:unit, build, test:csp:dist, perf:spotter, compile) recorded in 44-03 SUMMARY before any push; auditor re-ran test:unit (198 ok / 0 FAIL) and test:csp:dist (PASS); `check-ci-gates.js pipeline --revision d630652e --expect legacy-off` re-read: `CI-GATES PIPELINE OK 5662` (test, api-registry, vue-console-registry success, no snyk-* or console-classic-* job); live `console.thinx.cloud/js/app.js` re-fetched: 3153568 bytes, id `d630652` x2, all nine Phase 44 markers present, the four category strings absent; Legacy `main.js` `819c133e…7c16` and `LogviewController.js` `e556c292…c59d` equal the pre-deploy baseline; rollback is a revert of `d630652e` pushed to thinx-staging | closed |
| T-44-13 | Repudiation | pushed commits | medium | mitigate | `%G?` = `G` on all 12 console commits, all 11 parent outgoing commits and the bump; `commit.gpgsign=true` in both repos; GitHub reports the three pushed branch heads `verified: true` | closed |
| T-44-14 | Information disclosure | verification commands and evidence | medium | mitigate | `scripts/check-ci-gates.js` reads no token (header `:50`; no `process.env`, `Circle-Token` or `Authorization` in the file); scan of 44-01..03 SUMMARY for token, cookie, session header, Authorization, password and env-dump patterns: no hit beyond the "no login, cookie or token" statement; evidence is job names, statuses, hashes, sizes and marker counts | closed |
| T-44-SC | Tampering | npm/pip/cargo installs (44-01, 44-02, 44-03) | low | mitigate | the `vue/package.json` diff since `cfff199` is the one `test:unit` line (`&& node tests/unit/device-list-parity.cjs`); no lock file under `vue/` is tracked and `src/npm-shrinkwrap.json` is unchanged; the parent range changes nothing outside `.planning/` and `services/console`; the auditor ran npm scripts only, no install | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. The three SUMMARYs have no `## Threat Flags` section and each states "No new security surface beyond the plan's
threat model". The auditor found no unmapped surface: the BuildLogDialog now mounted on Devices maps to T-44-08, the
symbol `require.context` to T-44-02, and IconButton's `v-bind="$attrs"` receives only static attributes from its parent
templates.

---

## Auditor Notes (informational, not in the register)

- **N-1 (low, pre-existing, related to T-44-03/T-44-05):** a JSON object whose own `toString` is not a function (for
  example `{"toString":1}`) makes `String()` and `parseInt()` throw `TypeError` (auditor-checked in node). `cleanStatus`
  (`Devices.vue:368`), `symbolSrc` (`:361`) and the direct `basePlatform` calls in `platformPills`, `activePlatform`,
  `filteredItems` and the platform sort (`:305`, `:317`, `:326`, `:337`) are outside `platformInfo`'s try/catch. The
  API stores a check-in `status` as sent (`lib/thinx/device.js:467`, `:1233`) and GET /device returns it unchanged
  (`lib/thinx/devices.js:322`). A device holding the owner's API key could therefore stop that owner's Devices page from
  rendering. This is not a regression: at `cfff199`, `{{ device.status }}` threw the same way through Vue's `_s` helper.
  The effect stays with that one owner. Candidate fix for a later phase: accept only strings in `basePlatform`,
  `cleanStatus` and `symbolSrc` (`typeof raw === 'string' ? raw : ''`), or store `status`, `platform` and `icon` as
  strings in the API.
- **N-2:** the nine visual and interaction checks in 44-03 SUMMARY (layout at four widths, API-key tip, hammer glyph,
  View log, Revoke cancel, Repositories bullet, Legacy console-retest) are still pending operator UAT. They confirm the
  closed mitigations live but do not gate this register.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-13 | 15 | 15 | 0 | gsd-security-auditor (ASVS L1 grep-depth with L2 spot traces, block_on high, plan-time register from 44-01..03; re-ran console test:unit 198/0 incl. device-list-parity 52/0, test:csp:dist PASS, font cmp, pipeline 5662 read, live bundle markers and Legacy sha256 re-fetch, GitHub public branch heads; no token, no ssh, no push, no install) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-13
