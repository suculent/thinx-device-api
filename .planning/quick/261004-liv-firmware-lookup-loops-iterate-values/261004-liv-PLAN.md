---
quick_id: 261004-liv
type: quick
autonomous: true
files_modified:
  - lib/thinx/plugins.js
  - lib/thinx/deployment.js
  - spec/jasmine/FirmwareLookupSpec.js (new, local)
must_haves:
  truths:
    - "Plugins#extensions() returns the plugins' extension patterns (e.g. '*.bin'), de-duplicated, never array indices"
    - "Deployment#latestFirmwarePath searches the device deploy folder with each extension value and returns the newest matching firmware file (by mtime) across all extensions"
    - "After a successful build with a .bin in the deploy folder, ott_update finds the file (no OTT_UPDATE_NOT_AVAILABLE)"
    - "The check-in FIRMWARE_UPDATE decision path is traced end to end and reported with file:line; if it fails for the same mechanical reason (for...in over an array/string, or this lookup), it is fixed here with a spec; anything else is reported, not changed"
---

# Quick 261004-liv: firmware lookup loops iterate values, not indices

<objective>
Operator-reported (2026-10-04, untrusted-data boundary not needed — operator text):
<operator_report>
To serve a download, ott_update (lib/thinx/device.js ~1387) asks latestFirmwarePath (lib/thinx/deployment.js:283) for the newest firmware file in the device's deploy folder, using each plugin's file patterns (e.g. *.bin). Two loops are wrong:
1. Plugins.extensions() (lib/thinx/plugins.js:44) uses for (let xt in xts); on ['*.bin'] that yields "0", not "*.bin".
2. latestFirmwarePath (deployment.js:300) does the same with for (var extension in extensions).
Running the server's plugin loader, extensions() returns ["0"], so the server searches for a file literally named 0, never finds a .bin, and every download returns OTT_UPDATE_NOT_AVAILABLE even right after a successful build.
Fix: for...of in both loops. Both lines predate today (plugins.js 2026-04-20, deployment loop 2026-06-06), consistent with OTT downloads never having worked.
Not explained: why check-ins don't offer FIRMWARE_UPDATE — that decision may go through other code, not traced yet.
</operator_report>
Orchestrator note (verified read-only): lib/thinx/device.js ~160-175 has a related bug — `extensions` is a descriptor file PATH string, `for (let xindex in extensions)` walks its character indices, and the outer loop reads `all_files[findex]` while iterating `artifact_filenames`. Report what that function is used for and whether it affects builds/OTA; fix only if it is on the firmware-update path, otherwise record it as a todo.
Out of scope: plaintext port 7442 (kept by operator decision, AGENTS.md); the udid guard and log lines in latestFirmwarePath (next quick task 261004-l8k will do those — keep your edit to the loop so l8k can layer on top).
</objective>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: failing local spec</name>
  <action>LOCAL FirmwareLookupSpec: Plugins#extensions with stub plugins returning ['*.bin'] and ['*.bin','*.elf'] → values, deduped; latestFirmwarePath against a temp deploy dir (mkdtemp; stub/point Filez.deployPathForDevice or app_config data_root/deploy_root) containing firmware.bin + other files → returns the .bin path; two .bin with different mtimes → newest. Use the real plugin loader if it works offline (plugins/plugins.json). Commit spec-only; must fail first.</action>
</task>
<task type="auto">
  <name>Task 2: fix loops</name>
  <action>for...of in both loops (keep latest-across-extensions semantics: track the newest over all extensions, not just the last extension with matches — check current behaviour and fix only if it drops an earlier newer match). Commit.</action>
</task>
<task type="auto">
  <name>Task 3: trace FIRMWARE_UPDATE</name>
  <action>Trace how HTTP check-in (Device#register and helpers) decides to answer FIRMWARE_UPDATE (auto_update, version compare vs build envelope, latestFirmwarePath/envelope lookup, deploy.json/build.json). Report the chain with file:line and the concrete reason it may never fire. Apply the fix in this task only if it is the same lookup/loop class with a local spec; otherwise write a pending todo with the evidence. Commit code only (if any).</action>
</task>
</tasks>

## Orchestrator trace 2026-10-04 (production evidence; replaces the open-ended part of Task 3)

Device af6eac20-… reports `platform: arduino:esp8266`, `version: 0.1.0`, firmware `thinx-mcp-device:0.1.0`. Repo thinx-autoflood has `thinx.yml` `platformio: { arch: esp8266 }` and a multi-env platformio.ini. Build 0d9c2b60-… succeeded; worker poll bug (separate worker task) delayed deploy ~30 min, then `firmware.bin` (d1_mini env) + `build.json` landed at `<deploy>/<owner>/<udid>/`. Envelope: `platform: platformio`, `version: "thinx-autoflood:1.0"`, `env_hash: "cafebabe"`.

Platform path is viable: builder MCU check (yml arch esp8266 vs device mcu esp8266) passes; `platformSupportsUpdate` accepts `arduino`; envelope vs device platform is never compared in the update decision.

FIRMWARE_UPDATE never fires because of `Deployment#fixAvailableVersion` (lib/thinx/deployment.js ~72-134), verified by evaluating the real method:
- `"thinx-autoflood:1.0"` → `"0.1.0"` (one dot is mapped to `[0, major, minor]`), equal to the device's 0.1.0 → not outdated; equal-version branch then skips because env_hash starts with `cafebabe`.
- `"1.0"` (no `name:` prefix) → TypeError (`version_string` undefined → `.split`), which would throw inside check-in.
Task 3 is therefore concrete: fix `fixAvailableVersion` so `name:X.Y` → `X.Y.0`, `name:X` → `X.0.0`, unprefixed `X.Y`/`X` work the same, and non-numeric/garbage never throws (→ undefined = no update). Keep the 4-/5-part collapsing behaviour as is unless it contradicts these rules (report). Pin with a LOCAL spec on the real method incl. the three cases above and `hasUpdateAvailable` returning true for device 0.1.0 vs envelope `thinx-autoflood:1.0`.
Also: in lib/thinx/device.js ~290 the log `has auto-update disabled` prints whenever `update === false` — split it into "auto-update disabled" vs "no newer firmware" (log-only change).
Crossgrade (device firmware name ≠ envelope firmware name) is NOT decided — do not change that behaviour; report how the code treats it.
