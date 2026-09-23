# THiNX Device API Session Notes

## Deployment
- Production console URL: `https://rtm.thinx.cloud/`
- Swarmpit URL used for task monitoring: `https://swarmpit.thinx.cloud/#/tasks`
- When Codex makes source changes that should be validated in CI, push the commit to the current branch to trigger CircleCI instead of waiting for the user to do it manually.
- Deployment flow:
  - Push `services/console` to `thinx-staging`
  - Update parent repo submodule pointer and push parent `thinx-device-api` repo to `thinx-staging`
  - CircleCI builds and pushes images
  - Swarmpit rolls out the new service task
- User-provided server access:
  - `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`
  - Swarm path: `/mnt/gluster/deployment/swarm`

## Local Verification
- Build command:
  - `npm run build:test`
- Current test env used by build:
  - `LANDING_HOSTNAME=https://thinx.cloud`
  - `API_BASEURL=https://rtm.thinx.cloud`
  - `API_HOSTNAME=https://rtm.thinx.cloud/api`
  - `WEB_HOSTNAME=https://rtm.thinx.cloud`
- Generated local build artifacts to inspect:
  - `services/console/src/html/app/js/controllers/LogviewController.js`
  - `services/console/src/html/app/js/main.js`
  - `services/console/src/html/app/views/devices.html`

## Dependency Version Locks

### chai-http — hold at ^4.3.0, do NOT bump to v5

`chai-http` v5.x is **ESM-only** and removes the `chai.request(app)` API.
Upgrading would require:
- Converting all 16 ZZ-\* spec files from CommonJS (`require`) to ESM (`import`)
- Renaming ~200 `chai.request(thx.app)` call sites to `request.execute(thx.app)`
- Renaming 14 `chai.request.agent(app)` calls to `request.agent(app)`
- Potentially converting `thinx-core.js` and all lib modules to ESM

**Trigger to reconsider:** only if Snyk/Dependabot flags a CVE in `superagent` v3 (the underlying transitive dep).

### Builder base images — 22.04 is the ceiling, do NOT bump past it

Current state (check the `FROM` line before trusting this list):

| builder | base image |
|---|---|
| `builders/nodemcu-docker-build` | `ubuntu:22.04` — verified building 2026-09-20 |
| `builders/micropython-docker-build` | `ubuntu:22.04` |
| `builders/mongoose-docker-build` | `dhi.io/debian-base:trixie-dev` (Debian 13.7) — moved off Ubuntu 2026-09-22 |

A bump to `ubuntu:26.04` was attempted and rolled back on 2026-06-28 — all three break, each for a
different, non-trivial reason (verified by local `docker build` of each on `ubuntu:26.04`):

- **micropython** — 26.04 dropped `python2` / `python2-dev` from the archive. The esp-open-sdk
  fork (`pfalcon/esp-open-sdk`) is Python 2-only, so there is no in-place fix. 22.04 still ships
  `python2` in universe, which is why 22.04 is fine.
- **mongoose** — no longer applies: the image left the Ubuntu line entirely on 2026-09-22. The
  `ppa:mongoose-os/mos` dependency (which publishes focal only, hence the 26.04 `404 … resolute
  Release`) is gone — `mos` is now compiled from source in a `golang:1.27.1` stage and dropped
  into a Debian 13 DHI base. See *mongoose builder — mos is built from source* below.
- **nodemcu** — esp-open-sdk's bundled crosstool-NG toolchain fails to build against the 26.04
  host GCC/glibc: `configure: error: could not find a working compiler`. It builds clean on 22.04.

**Trigger to reconsider:** only when the upstream esp-open-sdk toolchain gains a
modern-Ubuntu-compatible release. Bumping past 22.04 requires replacing those toolchains, not just
the `FROM` line. (This ceiling is about the two esp-open-sdk builders; arduino and mongoose are
both on Debian 13 DHI.)

### mongoose builder — `mos` is built from source, not installed from the PPA

`builders/mongoose-docker-build` compiles **`github.com/suculent/mos`** — our fork — at pinned
commit `f612a4c` (branch `thinx/deps-2026-09`) in a `golang:1.27.1` stage and copies the binary
into a `dhi.io/debian-base:trixie-dev` runtime. Do not "simplify" this back to
`apt-get install mos-latest`, and do not point it at upstream `mongoose-os/mos`.

The fork exists because upstream's tree still carries its 2021 dependency set (x/crypto, go-git
v5.4.2, grpc v1.40, x/net), which grype scores at **77 findings, 11 critical**, and upstream has
shipped nothing since 2023-03-13. The fork branch bumps nine modules to current, raises the `go`
directive to 1.24+ (required by modern x/crypto), fixes three latent non-constant-format-string
bugs that vet then exposes, and adds `common/ourgit`'s first test — go-git's only first-party
consumer — which passes identically on v5.4.2 and v5.19.2. Image findings after the bump: **2**,
both non-applicable (a gRPC xDS *server* DoS fixed only in an unreleased `1.85.0-dev`, and the
standing "x/crypto/openpgp is unmaintained" advisory reached via go-git).

**Always repin `MOS_REF` by SHA after a fork change — never track the branch name**, or the image
stops being reproducible. Rebasing the fork on upstream is a no-op while upstream stays dormant.

The PPA `.deb` is a **go1.13.8** binary frozen since 2023-03-14. Grype reports **287 Go stdlib CVEs
against it, 18 of them critical**, and none of them are fixable by apt: the stdlib is linked into
that binary, not provided by the distro. Upstream has published nothing since, so re-linking the
same tree is the only lever. After the rebuild, grype reports **zero** stdlib hits. The image's remaining ~960 Debian findings
are **all** `not-fixed` or `wont-fix` upstream — zero are actionable, so do not spend time on them.

**Pin the Go stage to a supported line.** It was `golang:1.25.13` for a day; Go backports security
fixes to the two most recent majors only, so with 1.27 released the 1.25 line is already done
receiving them. Both builders track `golang:1.27.1`. Bump it when Go 1.29 ships, not before —
and rerun the build-chain tests, since the toolchain is what links these binaries.

Build-stage requirements: `python3` (the Makefile generates `version/version.go` via
`tools/fw_meta.py`), plus `pkg-config libusb-1.0-0-dev libftdi1-dev libudev-dev` — `mos` links
libusb/libftdi through cgo (`gousb`, `cesanta/hid`, `cesanta/go-serial`). The runtime image
therefore needs `libusb-1.0-0` and `libftdi1-2`, which the PPA package used to pull in as `Depends`.

Verified 2026-09-22: the image builds and `mos build --arch=esp8266` produces `fw.zip` through
`build.mongoose-os.com`.

**Fixed alongside the base move (2026-09-22):** `cmd.sh` used to call `/root/.mos/bin/mos update`
under `set -e`, and `/root/.mos` has never existed in the published image — the entrypoint died
there before it built anything. `mos update` is dead upstream too (`404` on
`mongoose-os.com/downloads/mos-latest/version.json`; the PPA build shelled out to `sudo apt-get`,
which is not installed). It now calls `mos` from `PATH` with no update step; running the entrypoint
against `mongoose-os-apps/demo-js` reports `THiNX BUILD SUCCESSFUL.` and writes `build/fw.zip`.

Two further pre-existing bugs in that script, **not** fixed: the arch probe is inverted
(`if [[ -z $(cat ./mos.yml | grep "esp32") ]]; then ARCH='esp32'` — a project that *mentions* esp32
builds as esp8266, and vice versa), and `RESULT=$?` after the build is unreachable under `set -e`,
so `THiNX BUILD FAILED` can never print.

### arduino builder — the JRE and `arduino-builder` are re-linked in builder stages

The Arduino 1.8.19 tarball ships two prebuilt runtimes that scanners flag and that no base bump can
reach: `arduino-builder` linked against **go1.14.4**, and an **Oracle JRE 1.8.0_191**
(`BUILD_TYPE="commercial"`). All three Dockerfiles now rebuild the first with Go 1.27.1 and replace
the second with **Temurin 8u462** — Oracle's own 8u461 is licence-gated, Temurin 8u462 is the
redistributable build at the same CPU level, and Debian 13 ships no openjdk-8 at all (21 and 25
only). The IDE is still Java (`cmd.sh` runs `arduino --verify` and `--install-library`), so the JRE
cannot be dropped; `arduino-cli` would remove both findings at once but is a rewrite of `cmd.sh`.

Two traps, both recorded in `arduino-docker-build/CHANGELOG.md` 0.8.217: `arduino-builder` must be
built from commit `99ac98e`, not `master` (master pulls a 2022 `arduino-cli` that rejects
`/opt/workspace/<name>.ino` with `main file missing from sketch`), and `go.zipexe` must be replaced
with v1.0.2 (v1.0.0 nil-derefs in `debug/elf` on a modern-linker binary, so `go.rice` panics in
`init()`).

### nodemcu builder — newlib tarball pre-seeded on purpose

`builders/nodemcu-docker-build/Dockerfile` downloads `newlib-2.0.0.tar.gz` into
`/home/nodemcu/tarballs` and appends `CT_LOCAL_TARBALLS_DIR` + `CT_CONNECT_TIMEOUT=60` to
esp-open-sdk's `crosstool-config-overrides` before running `make`. Do not "simplify" this away.

crosstool-NG 1.22 lists three newlib mirrors in `scripts/build/libc/newlib.sh`, but two are dead on
arrival: the `{a,b}` mirror list lives in a shell variable, and bash does brace expansion *before*
parameter expansion, so those two expand to the literal words `{http://mirrors.kernel.org/…,` and
`ftp://sourceware.org/pub/newlib}`. Only `http://mirrors.kernel.org/sources.redhat.com/newlib`
survives — a single mirror, fetched for a 15 MB file under a 10s timeout.

**Symptom when it flakes:** the Docker build dies in `RUN cd /home/nodemcu/esp-open-sdk/ && make`
with `Build failed in step 'Retrieving needed toolchain components' tarballs'` /
`do_libc_get[scripts/build/libc/newlib.sh@26]`. This looks like a base-image/compiler problem and
is not one — everything before it (autoconf, `./configure`, kconfig, `ct-ng xtensa-lx106-elf`) has
already succeeded. Seen on CircleCI 2026-09-17 (run `aa3f2ead`) while the identical image built
clean locally minutes earlier.

The pinned version tracks `CT_LIBC_NEWLIB_V_2_0_0` in the upstream sample config
`crosstool-NG/samples/xtensa-lx106-elf/crosstool.config` — bump the URL, the sha256 and that
setting together.

### Builder CI checkout — HTTPS, not SSH

The builder repos' CircleCI `deploy-docker-build` job clones the (public) repo over anonymous HTTPS
instead of the orb's default SSH `checkout`. The SSH checkout/deploy key is not provisioned on these
repos, so the built-in `checkout` fails with `git@github.com: Permission denied (publickey)`. Keep
the explicit `git clone https://github.com/suculent/<repo>.git .` step.

---
