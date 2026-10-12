---
status: diagnosed
trigger: "UAT gap G-36-3 — the history should not list full build logs (only on \"Open build log\" -> \"View\" / it is to slow to load now."
created: 2026-10-12T12:00:00Z
updated: 2026-10-12T12:32:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic: every row click/Enter/Space fires the same request; cost scales with build.log size)
hypothesis: CONFIRMED (code + experiments) — Device Build History rows are wired directly to the full-log endpoint, and that endpoint is heavyweight (sync GlusterFS read, whole file as a ~3.4x-inflated JSON Buffer byte array, no compression); there is no lightweight "Open build log" control on the device page.
test: done — code trace of list vs detail paths, Buffer-JSON size experiment, old/new normalizeBuildItems differential
expecting: n/a
next_action: return ROOT CAUSE FOUND to orchestrator (goal find_root_cause_only); plan-phase --gaps owns the fix

reasoning_checkpoint:
  hypothesis: "Device Build History is slow and 'lists full build logs' because phase 36 made every DeviceDetail.vue history <tr> a role=button that, on any click/Enter/Space, opens BuildLogDialog, which fetches GET /api/v2/logs/build/:id; that endpoint reads build.log synchronously from GlusterFS and returns it as a JSON Node Buffer ({type:'Buffer',data:[...]}, ~3.4x the log size, uncompressed), which the client decodes and renders in one <pre>."
  confirming_evidence:
    - "DeviceDetail.vue:128 <tr ... role=button @click/@keydown.enter/@keydown.space=openBuildLog(build)> -> BuildLogDialog.open -> buildlog/fetchBuildDetail -> GET /logs/build/:id (only consumer of the detail endpoint)"
    - "Buildlog#_fetch: fs.readFileSync(<deploy>/<build_id>/build.log) on /mnt/gluster/thinx/deploy; Util.respond JSON.stringify -> Buffer.toJSON byte array; measured x3.39 (2 MB log -> 6.8 MB JSON); no compression in Traefik or Express"
    - "List path carries <= one status line per build (measured 96-434 B/item), so the list itself is not where full logs come from"
  falsification_test: "If the device page were slow before any row is activated (blank until loadDevice settles) with build list responses in the KB range, the slowness would be in page-load fetches, not the full-log fetch. Not observable without production access."
  fix_rationale: "Not fixing (find_root_cause_only). Direction: keep the history list summary-only, gate the full-log fetch behind an explicit 'Open build log' control (History.vue pattern), and make the detail payload cheap (string not Buffer, compression/size cap or tail-first)."
  blind_spots: "Real production build.log sizes and live timings not measured (no production access per constraints); the user's 'too slow to load' could also include device-page load time, which phase 36 did not change; 'View' control does not exist anywhere in Vue, so the exact two-step UX the user wants needs confirmation."
  candidate_causes:
    - "code: DeviceDetail.vue history rows are unguarded full-log triggers (no explicit button, unlike History.vue after 35 WR-01)"
    - "code: detail endpoint serializes build.log as a Buffer byte array and reads it synchronously"
    - "config/environment: no HTTP compression on Traefik or Express; build.log on GlusterFS"
    - "data: build.log holds full TTY docker builder output (large)"
  and_gate: "yes — the perceived slowness needs the row-triggered full-log fetch AND an expensive full-log response (Buffer JSON, uncompressed, sync Gluster read) AND a large build.log; the 'history lists full logs' UX complaint is the row-trigger alone."

## Symptoms

expected: On a device's detail page, a row in Build History opens the same full-log dialog for that build, by click or by Enter on the focused row. Build History list must NOT load/show full build logs inline; full log only in the dialog opened via "Open build log" -> "View".
actual: (verbatim user) "the history should not list full build logs (only on \"Open build log\" -> \"View\" / it is to slow to load now."
errors: None reported
reproduction: Test 3 in .planning/phases/36-build-log-access/36-UAT.md (live console rtm.thinx.cloud, device detail page)
started: Discovered during UAT 2026-10-12, after phase 36 (BUILD-01/02) shipped. "now" suggests regression introduced by phase 36.

## Eliminated

- hypothesis: The build list endpoint (GET /api/v2/logs/build?limit=100) now returns full build-log text per build, so Device Build History is slow to load.
  evidence: Buildlog.toBuildListItem keeps only the latest log line; no production caller sets `contents`; build.log is read only by the detail endpoint; measured list items are 96-434 bytes with log <= ['started']. Phase 36 backend change only adds build_id/state/start_time to log-less docs.
  timestamp: 2026-10-12T12:26:00Z

- hypothesis: Phase 36 added a new heavy page-load fetch to the device detail page.
  evidence: loadDevice's fetch set is devices + build list + transformers + repositories (repositories added in phase 35); phase 36 added no page-load request. Header/Notifications/Routes diffs are UI-only.
  timestamp: 2026-10-12T12:24:00Z

- hypothesis: The Device Build History table renders full build-log text inline.
  evidence: The Build History table renders only date / build_id / status. The adjacent pre-existing "Device Logs (last build)" card renders normalized list `log` lines inline, which are at most a one-line status message (now 'started' for flat docs after the phase 36 normalizeBuildItems fallback), not the build.log file.
  timestamp: 2026-10-12T12:26:00Z

## Evidence

- timestamp: 2026-10-12T12:00:00Z
  checked: .planning/debug/knowledge-base.md
  found: does not exist; no prior resolved pattern to match
  implication: open-ended investigation

- timestamp: 2026-10-12T12:05:00Z
  checked: git -C services/console diff d5c09e7 HEAD (vue/src) — DeviceDetail.vue, History.vue, store/buildlog.js, utils/buildLog.js, BuildLogDialog.vue, core/api.js
  found: Phase 36 added BuildLogDialog (fetches GET /api/v2/logs/build/:id on open), made every Device Build History <tr> a role=button that calls openBuildLog(build) on click/Enter/Space, changed normalizeBuildItems so `log` falls back to the doc's own top-level log lines (was [] for flat docs), and changed api.parseResult to merge multi-key responses ({log, contents}) instead of returning only the first key.
  implication: the full-log fetch is new in phase 36 and is triggered from list rows; the list items' `log` field is now non-empty for flat docs.

- timestamp: 2026-10-12T12:08:00Z
  checked: lib/router.logs.js getBuildLogs + lib/thinx/buildlog.js listPage/list/toBuildListItem (backend list endpoint)
  found: list (paged ?limit=100, include_docs) maps each doc through toBuildListItem, which reduces doc.log to the single latest line; phase 36 backend change (58027c18) only added build_id/state/start_time to log-less docs. No production code passes `contents` to Buildlog#log (only "started" and the symlink warning messages; contents defaults to ""). The build.log FILE is read only in Buildlog#_fetch (detail endpoint).
  implication: the list API does NOT ship full build-log text; list-request size did not grow materially in phase 36.

- timestamp: 2026-10-12T12:10:00Z
  checked: Buildlog#_fetch + Util.respond (detail endpoint GET /api/v2/logs/build/:bid)
  found: detail reads <deploy path>/<build_id>/build.log with fs.existsSync + fs.readFileSync (synchronous, on the request thread) and responds JSON.stringify({log, contents: <Buffer>, success}) — a Node Buffer serializes as {"type":"Buffer","data":[n,n,...]}, i.e. one decimal number + comma per byte (~3.5x the log size for ASCII text). Client decodes via new Uint8Array(data) + TextDecoder (utils/buildLog.js).
  implication: every "open full log" costs a sync file read + an inflated byte-array JSON on server and client; heavy for large firmware build logs.

- timestamp: 2026-10-12T12:12:00Z
  checked: DeviceDetail.vue template + loadDevice()
  found: whole page is `<div v-if="device">`; device is set only after Promise.allSettled([fetchItems, fetchBuildLog, fetchTransformers, fetchRepositories]). Below the Build History table there is a pre-existing "Device Logs (last build)" card that renders allBuilds.filter(b => b.build_id === device.last_build_id)[*].log inline in a terminal-styled <pre> (same look as the dialog). Only UI labelled "Open build log" in Vue is History.vue's per-row button; no "View" control exists anywhere in Vue (Legacy history uses an eye icon = view).
  implication: on the device page, log text is rendered inline (Device Logs card) and the row itself is a full-log trigger; there is no separate lightweight "Open build log" control.

- timestamp: 2026-10-12T12:20:00Z
  checked: Experiment (scratchpad bufjson.cjs) mirroring Buildlog#_fetch + Util.respond and utils/buildLog.js buildLogText on synthetic compiler-output logs
  found: Buffer-JSON is x3.39 the log size — 50 KB -> 170 KB, 500 KB -> 1695 KB, 2000 KB -> 6781 KB (the same text as a JSON string would be ~1x). Server JSON.stringify 4/17/64 ms, client parse+Uint8Array+TextDecoder 2/16/114 ms (laptop). Round-trip text identical.
  implication: transfer size, not CPU, dominates: each full-log open downloads ~3.4x the log, uncompressed.

- timestamp: 2026-10-12T12:22:00Z
  checked: thinx-swarm *.yml/*.toml and thinx-core.js / lib for compression
  found: no Traefik compress middleware and no express compression() anywhere. api service mounts /mnt/gluster/thinx/deploy at /mnt/data/deploy, so build.log is read with readFileSync from GlusterFS on the API event loop.
  implication: the inflated payload travels raw, and large reads block the API process while they run.

- timestamp: 2026-10-12T12:24:00Z
  checked: services/worker/builder — what lands in build.log
  found: the whole `docker run -t ...` builder output (arduino, mongoose, pine64, platformio, nodemcu) is piped through `tee -a "${LOG_PATH}"`, TTY mode, i.e. full toolchain/compiler output with progress redraws.
  implication: real build.log files are routinely large; the full-log dialog is the expensive operation.

- timestamp: 2026-10-12T12:26:00Z
  checked: Differential experiment — normalizeBuildItems at d5c09e7 vs HEAD on items produced by the real Buildlog.toBuildListItem (flat doc, pre-09-19 nested doc, log-less state doc)
  found: list item JSON sizes 434 / 201 / 96 bytes. Old: log [] / ['started'] / []. New: log ['started'] / ['started'] / [] (and build_id now populated for log-less docs).
  implication: the list path (and the inline "Device Logs (last build)" card) carries at most a one-line status message per build; the only place a full build log is loaded is BuildLogDialog -> GET /logs/build/:id, which Device Build History rows fire on any click/Enter/Space.

- timestamp: 2026-10-12T12:28:00Z
  checked: DeviceDetail.vue Build History row vs History.vue Builds row (35 WR-01 pattern)
  found: History.vue keeps table semantics, has an explicit per-row "Open build log" button, and guards the mouse row-click (ignores clicks on controls and text selection). DeviceDetail.vue's <tr> is tabindex=0 role="button" with unguarded @click/@keydown.enter/@keydown.space -> openBuildLog(build); no "Open build log" button; any click on a history row (or Enter/Space while tabbing through the page) starts a full-log download.
  implication: the device page is the one list where browsing/scrolling/tabbing the history fires the heavy full-log request; the user's "only on 'Open build log' -> 'View'" matches the History.vue explicit-button pattern.

## Resolution

root_cause: "Phase 36 (BUILD-01) wired the Device Build History rows directly to the full build log: each <tr> in services/console/vue/src/pages/Devices/DeviceDetail.vue is tabindex=0 role=button with unguarded @click/@keydown.enter/@keydown.space -> BuildLogDialog.open -> buildlog/fetchBuildDetail -> GET /api/v2/logs/build/:id, and the device page has no separate 'Open build log' control (History.vue has one since 35 WR-01); AND that detail endpoint is heavyweight: lib/thinx/buildlog.js _fetch reads the whole build.log with fs.readFileSync from GlusterFS and lib/thinx/util.js respond() JSON.stringifies the Node Buffer as a {type:'Buffer',data:[...]} byte array (~3.4x the log size), sent uncompressed (no Traefik/Express compression), then decoded byte-by-byte in vue/src/utils/buildLog.js and rendered as one <pre>. The list endpoint itself is light (<= one status line per build); the pre-existing 'Device Logs (last build)' card additionally renders list log lines inline under Build History, and phase 36's normalizeBuildItems fallback made those lines non-empty ('started')."
fix: (not applied — goal find_root_cause_only)
verification: (n/a)
files_changed: []
artifacts:
  - services/console/vue/src/pages/Devices/DeviceDetail.vue (Build History <tr> row-as-button -> openBuildLog; 'Device Logs (last build)' inline <pre> card)
  - services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue (fetches full log on open, no cache/abort)
  - services/console/vue/src/store/buildlog.js (fetchBuildDetail; normalizeBuildItems log fallback)
  - services/console/vue/src/utils/buildLog.js (Buffer byte-array decode)
  - lib/thinx/buildlog.js (_fetch: sync readFileSync of build.log, returns Buffer)
  - lib/router.logs.js (fetchBuildLogID -> Util.respond)
  - lib/thinx/util.js (respond: JSON.stringify of Buffer)
missing:
  - explicit 'Open build log' control on the device Build History (History.vue pattern) instead of row-as-button
  - summary-only history list on the device page (no inline log <pre> under Build History)
  - cheap full-log payload: text string instead of Buffer byte array, and/or compression, size cap or tail-first loading
