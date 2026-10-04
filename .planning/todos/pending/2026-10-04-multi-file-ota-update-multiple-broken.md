---
created: 2026-10-04T14:30:00.000Z
title: Multi-file OTA (Device#update_multiple) has never worked
area: api
severity: low
source: quick 261004-liv
files:
  - lib/thinx/device.js:113-170 (updateFromPath, multi-file branch; fails closed since 261004-liv)
  - lib/thinx/device.js:172-222 (update_multiple)
  - lib/router.deviceapi.js:15-37 (GET /device/firmware?ott= serves only a binary)
---

## Problem

`Device#updateFromPath` sends nodemcu, micropython, mongoose and nodejs builds to
`update_multiple(firmware_path, callback)`. That function has never been able to answer:

- `:179` reads `platforms/descriptor.json`. That file does not exist; the descriptors are
  per platform (`platforms/<platform>/descriptor.json`). The read throws ENOENT on the first line.
- `:187` `extensions` is a descriptor file **path string**, not a list. `for (let xindex in
  extensions)` at `:197` walks its character indices and compares single characters.
- `:192` `fs.readdirSync(path)` is given `<deploy>/firmware.bin`, a file, so it would throw
  ENOTDIR even with the descriptor fixed.
- `:195-196` the outer loop iterates `artifact_filenames` (zero or one header file) but reads
  `all_files[findex]`, so it would pick the wrong file.
- On success the answer is `{type: "file", files: [{name, data}]}`. `GET /device/firmware?ott=`
  then sets `Content-Length: undefined`, which throws in Express. Only POST /device/firmware
  could carry a JSON multi-file answer.

Before 261004-liv nothing reached this code: the firmware lookup always answered false. With
the lookup fixed, a redemption for one of these platforms reached it, threw, and
`supportedExtensions` called back a second time from its `.catch`. That second throw escaped
as an unhandled rejection, which can bring down the API process. 261004-liv makes
`updateFromPath` fail closed (`callback(false)` once) and makes `supportedExtensions` call
back exactly once. Multi-file updates still do not work; they now fail cleanly.

## What it is for

It serves script-based firmware (Lua init.lua/config.lua/thinx.lua, MicroPython boot.py/thinx.py,
Node.js) as a set of files instead of one binary. The source comment says "not yet fully
supported". Arduino, PlatformIO and Pine64 builds never use this path.

## Decide before fixing

- Do any deployed devices on these platforms still check in? If none do, remove the branch and
  answer "not supported".
- If yes: what wire format do the THiNX Lua and MicroPython libraries expect for a multi-file
  update, and on which route (OTT GET or POST /device/firmware)?

## Related, found in the same trace (not changed)

- `Deployment#hasUpdateAvailable` (`lib/thinx/deployment.js:384-397`), equal-version branch: if
  the envelope has no `env_hash`, `getAvailableEnvironmentHash` answers `null`.
  `deviceHash.indexOf(null)` then searches for the string "null", answers -1, and the device is
  offered the same firmware on every check-in (unless its hash starts with `cafebabe`). A
  non-string `device.env_hash` throws at `:390`.
- `Device#update_binary` logs `update_binary from path: <deploy>/<owner>/<udid>/firmware.bin`,
  which puts the owner id in the log. The same applies to the `Envelope … not found` line in
  `latestFirmwarePath`, which is in scope for 261004-l8k.
