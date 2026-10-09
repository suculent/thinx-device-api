---
phase: 34-ops-surface-reduction-sla-close-out
review: 34-REVIEW.md
fixed_at: 2026-10-09T18:05:00Z
status: partial
findings_total: 14
fixed: 13
partial: 1
needs_operator: 1
thinx_swarm_head: 51ff67f
live_changes: 3
---

# Phase 34: Code Review Fix Report

13 of 14 findings are fixed. WR-06 is **partial**: the documentation is fixed, but the move to bcrypt needs the operator
to supply the plaintext password again. It was shredded on micro at 16:08:38Z. The checkpoint is in the executor's
return.

Repo state: thinx-swarm `51ff67f` == origin/master == the micro checkout (tracked-dirty 0). `MIRROR OK files=1`, 24
flags. Nothing was pushed to thinx-staging. `.planning/STATE.md` and `.planning/ROADMAP.md` were not touched.

The live changes, with backups, Version.Index values, gates and revert lines, are in
`.planning/runbooks/traefik-edge-hardening.md` § `### P34 review fixes record`. They are also steps (r1)–(r3) of the
Phase 34 ordered revert set.

| ID | Outcome | Commit(s) | Evidence |
|---|---|---|---|
| WR-01 | fixed (repo-only; no live change needed) | thinx-swarm `3040c06` | `restart.sh` and `thinx.sh` read the env file literally: a line reader that splits on the first `=` and runs `export "$k=$v"`, with no eval, no sourcing and no `$` expansion. An inherited `HASHED_PASSWORD` is unset first. A missing, unreadable or empty file fails closed with one stderr line. The value must be a bare apr1 or bcrypt `$2y$` hash. In `thinx.sh` all of this runs before `docker stack rm`. The `env -i` scratch matrix on script copies (docker stubbed, synthetic values) passed **20/20 under both bash 3.2 and 5.2**. Missing, empty and unreadable files give rc 1, no stdout, no env lines and no docker call. Single-quoted, double-quoted and `$$` values give rc 1. A stale inherited var with no file line gives rc 1. A stale inherited var with a valid file line uses the file's sha. Valid apr1 and valid bcrypt (CRLF, no trailing newline) give rc 0. On micro, the old and new loaders render `docker stack config` identically: 482 lines, sha `e82ca19d11fc` (in memory only; sha printed, nothing deployed) |
| WR-02 | fixed (live) | thinx-swarm `9204a8e`; this repo `06eb7e9e`, `0a5c061c`, `ac188048` | `--providers.swarm.endpoint=tcp://traefik_socket-proxy:2375`. Before the change, `nslookup` inside the Traefik task returned only `10.234.34.2` and `nc -z` showed it OPEN. `traefik-public` already has two services aliased `web`, a live example of this collision class. Backup `p34rf-wr02-traefik_traefik-20261009T175450Z.json`. The dry-run diff was exactly that one Arg, and the count stayed 24. It went live as ONE `--args` update after asserting the proxy was 1/1 and healthy: idx 38380188 → **38380330**, task `vtdqxehcuul8` → `23q5m86cc7zc`. Gate: overview `[29,0,18,6,["Swarm","File"]]`; router-name md5 `218439c68631` unchanged; time-bounded logs show 0 provider errors and 0 ERR (8 normal WRN); 7442/1883/8883 OPEN (micro-local); rtm and app 200; harness **PASS** on both paths (`p34rf-post-7442`, `p34rf-post-https`). swarm.md's rollback filter now matches by prefix |
| WR-03 | fixed (live) | thinx-swarm `a365644`; this repo `052f8b48` | `influx-auth.basicauth.removeheader=true` in `thinx.yml` and `docker-swarm.yml`. Backup `p34rf-influxrh-thinx_influxdb-20261009T175153Z.json`. Label-only change: idx 38380190 → **38380302**, task `mulafi7tbk6u` unchanged. The API reports `removeHeader: true`. `https://influx.thinx.cloud/` returns 401 with the Basic challenge, and `http://` returns 301 |
| WR-04 | fixed | this repo `43a60bea` | `RETIRED_HOSTS="micro.thinx.cloud"` gets exposure probes only, with `curl -k`. Each probe fails on Traefik API JSON at `/api/overview` or `/api/http/routers`, the `APIUrl` signature, or a 401 on `/dashboard/`, and fails closed on curl or jq errors. `HOSTS` stays at 16. A live run of the block printed `api=302 dashboard=302 sig=0` (nginx catch-all) and `EDGE-SCAN OK`. The jq predicate gives rc 0 for `{"http":…}` and for a non-empty array, and rc 1 for `[]`, HTML or an empty body |
| WR-05 | fixed | this repo `a70837ee` | `03-RsakeySpec` points `rsakey.ssh_keys` at `mkdtemp(os.tmpdir()/rsakey-spec-)` and removes it in `afterAll`. Run with `HOME=<scratch>`, `ENVIRONMENT=development` and a scratch jasmine config: 15 specs, 1 failure, which is (13) `purgeOrphanedKeys` (no CouchDB locally; pre-existing, same as in the debug notes). The **new spec leaves 0 files** in the scratch `HOME/.ssh` and 0 temp dirs; the **old spec leaves 6** (3 key pairs). The real `~/.ssh` file-name list is identical before and after (128 names, compared by `cmp`; names only, no contents read) |
| WR-06 | **partial** — docs fixed; bcrypt **needs-operator** | thinx-swarm `4cc2168`; this repo `0a5c061c`, `ac188048` | AGENTS.md, the thinx-swarm README and the runbook now say that `600 root:root` keeps out non-root users only, and that root on the nodes and root containers that bind the `thinx` tree (today `thinx_worker`) can read the hash. bcrypt: micro has **no `htpasswd`**; it has **python3 `bcrypt` 3.2.2**, which emits `$2b$` (rewrite the prefix to `$2y$`, the form the WR-01 check accepts). This was proven with synthetic values in a `--network none` `traefik:v3.7.14` throwaway: `$2y$` and `$2b$` both returned 200 for the right password and 401 for a wrong one or none. The plaintext is needed again, so this ends in a checkpoint |
| IN-01 | fixed (live) | thinx-swarm `9204a8e`, `51ff67f`; this repo `06eb7e9e`, `61befe53`, `ac188048` | Added a real healthcheck, `["CMD","/healthcheck"]` (`docker exec … /healthcheck` → rc 0 first), plus `update_config.order: start-first`. The image is `FROM scratch`, and `--health-cmd` always writes `CMD-SHELL`, so the change was applied through the Engine API: dry-run diff (exactly those 2 changes), then the apply with that file. Backup `p34rf-in01-traefik_socket-proxy-20261009T175322Z.json`. idx 38380136 → **38380315**; the new task `2p48l57isdvn` was `(healthy)` before the old one stopped. Gate: proxy 1/1; `_ping` OK; `/secrets` 403; 0 Traefik log lines in the window; overview and routers unchanged |
| IN-02 | fixed | thinx-swarm `9204a8e` | `traefik.sh` refuses to run unless the docker.sock gid equals the gid in `traefik.yml`. Scratch test with a stubbed `stat`: 998 proceeds; 999 gives rc 1 and no docker call. The live socket gid on micro is 998 (`docker`). The change procedure is documented in `traefik.yml`, the README and swarm.md |
| IN-03 | fixed | thinx-swarm `9204a8e`; this repo `ac188048` | `traefik.yml`, the README and swarm.md now say that `:ro` is cosmetic and the anchored allow-list is the security boundary |
| IN-04 | fixed | thinx-swarm `9204a8e`; this repo `ac188048` | The residual exposure through `/services` and `/tasks` (Env secrets, basicauth hash labels) is documented, along with "never add a second consumer" |
| IN-05 | fixed | thinx-swarm `9204a8e`; mirror `06eb7e9e` | The `security-headers` comment now says `@file`, and the curve comment says "no curve list = Go default incl. X25519MLKEM768" |
| IN-06 | fixed | this repo `0a5c061c` | AGENTS.md's opening sentence now says "no basic-auth credential on any dashboard/API route" and points to couch-auth/influx-auth |
| IN-07 | fixed | thinx-swarm `9204a8e`; this repo `ac188048` | Step 2 of the README rotation procedure parse-checks `tls.toml` in a `--network none` throwaway before `docker config create`. Proven on micro: the tls-config-3 file prints `1`/`0`, and a copy with one broken TOML header prints `0`/`1`. No throwaway was left behind |
| IN-08 | fixed | this repo `666e5bf5` (lib + node tests), `a70837ee` (jasmine 03b) | `RSAKey.create` claims `<owner>-<ts>.pub` with an exclusive `wx` create before keygen. On a clash it moves to ts+1 ms, so the name is still `<owner>-<digits>` and `KEY_FILENAME` and the console are unchanged. The private key is written with `wx`, and a failed generation releases the claim. The API signature and response shape are unchanged. `npm run test:deploykeys`: **6/6**. The new clash test **fails on the old code** (5/6) and passes on the new. Jasmine (03b): two concurrent creates get distinct names and keep their own key material |

## Pre-existing finding surfaced while gating (not a review finding, not changed)

`thinx_mosquitto` does not listen on **`:8883`** (TLS MQTT). From the Traefik task over the overlay, `tasks.mosquitto`
answers 1883 and 1884 but not 8883. `188.166.23.244:8883` is CLOSED from micro and from the laptop. Host
ufw/NAT/docker-proxy are fine. The task has been Running on core since about 06:50Z, which is before Phase 34. The
"8883 OPEN" result in every Phase 34 gate came from the micro-local docker-proxy probe, which cannot see this. It is
recorded under "Recorded for later" in the hardening runbook. Plaintext `:7442` and `:1883` work (harness PASS).

## Verification commands

- `npm run test:deploykeys` → `pass 6 fail 0`
- `HOME=<scratch> ENVIRONMENT=development GIT_KEY_PASSPHRASE=<synthetic> npx jasmine --config=<scratch: only 03-RsakeySpec>` → 15 specs, only (13) fails (CouchDB)
- `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` → `MIRROR OK files=1`
- `bash -n` on `restart.sh`, `thinx.sh`, `traefik.sh`, `scripts/traefik-edge-scan.sh` → OK
