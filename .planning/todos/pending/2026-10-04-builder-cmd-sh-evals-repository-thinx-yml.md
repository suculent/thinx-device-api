---
created: 2026-10-04T16:00:00.000Z
title: builders/*/cmd.sh still eval the repository's thinx.yml
area: builders
severity: high
source: quick 261004-m46 (T-23-14 follow-up; the worker side is fixed)
files:
  - builders/arduino-docker-build/cmd.sh:17 (parse_yaml), :71 (eval)
  - builders/platformio-docker-build/cmd.sh:8 (parse_yaml), :59 (eval)
  - builders/nodemcu-docker-build/cmd.sh:5 (parse_yaml), :53 (eval)
  - builders/micropython-docker-build/cmd.sh:17 (prints the parse), :18 (eval)
  - services/worker/builder-lib.sh (thinx_yml_load: the worker's non-evaluating loader to port)
---

## Problem

Quick 261004-m46 removed `eval` of thinx.yml from the worker (`services/worker/builder` and
`infer`). The build images still do the same thing inside their entrypoints:

    eval $(parse_yaml "$YMLFILE" "")

`parse_yaml` emits `export name="value"` with the value unescaped, so a thinx.yml value such as
`$(...)`, a backtick or a `"` runs as shell inside the build container. The `$(...)` is also
unquoted, so it is word-split before the eval.

thinx.yml is repository content (the user's own repo), and the API writes decrypted devsec
credentials into it before the build (`lib/thinx/builder.js`, `YAML.stringify`).

The plan for 261004-m46 rated this "lower privilege" because it runs inside the build
container. Check that before you rely on it. On the swarm path, `swarmbuild`
(services/worker/builder-lib.sh) creates every build service with
`--mount type=bind,source=/var/run/docker.sock,...`. On the non-swarm path the worker passes
`-v /var/run/docker.sock:/var/run/docker.sock` (`DOCKER_PREFIX`) when it runs inside Docker. With
docker.sock mounted, code execution in the build container is equivalent to root on the host.
The severity is therefore set to high, not low.

Secondary: `builders/micropython-docker-build/cmd.sh:17` runs `parse_yaml thinx.yml` once
without eval. That prints every parsed value, devsec ssid/pass/ckey included, to stdout, and the
worker tees stdout into the build log.

## Variables each image reads after the eval

- arduino: `arduino_platform arduino_arch arduino_board arduino_flash_ld arduino_f_cpu
  arduino_flash_size arduino_partitions arduino_libs arduino_source arduino_test
  environment_target`
- platformio: `platformio_environment platformio_target environment_target`
- nodemcu: `nodemcu_modules_c nodemcu_modules_lua`
- micropython: `micropython_platform micropython_modules`
- mongoose: no thinx.yml eval (it reads `mos.yml` with sed only)

Re-grep each cmd.sh before you rely on this list.

## Suggested fix

- Port `thinx_yml_load` from services/worker/builder-lib.sh: awk parse, a fixed `case`
  allowlist per image, literal values, rejection of multi-line and control-character values,
  and no output. Each image needs its own allowlist from the list above.
- `arduino_libs` is a YAML list. parse_yaml keeps only the last item, because list entries all
  map to the same name. Check what cmd.sh expects before keeping that behaviour.
- Drop the bare `parse_yaml thinx.yml` print in micropython cmd.sh.
- Each builder is its own submodule/repo (suculent/<name>-docker-build) with its own CI and
  image publish. One commit per builder, then bump the gitlinks in the parent.
- Add a marker-file test per image (the pattern is in services/worker/builder.test.js:
  `$(touch PWNED)` in a temp dir, assert that no file appears).
- Separately, consider whether build services need docker.sock at all. Removing that mount
  would contain any future injection inside the build container.
