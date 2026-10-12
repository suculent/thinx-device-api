---
phase: 34-ops-surface-reduction-sla-close-out
review: 34-REVIEW.md
fixed_at: 2026-10-11T17:04:00Z
status: all_fixed
findings_total: 14
fixed: 14
partial: 0
needs_operator: 0
thinx_swarm_head: 5005ca0
live_changes: 4
---

# Phase 34: Code Review Fix Report

All 14 findings are fixed. WR-06 was partial on 2026-10-09 (docs only; the bcrypt move needed the plaintext again).
It was closed on 2026-10-11, 16:47–17:04Z, after the operator re-placed the password ("placed + move"). The hash is
bcrypt live, and the stored copy moved out of the worker-bound `thinx` tree.

Repo state: thinx-swarm `5005ca0` == origin/master == the micro checkout (tracked-dirty 0). `MIRROR OK files=1`, 24
flags (`09f98bf1`). Nothing was pushed to thinx-staging. `.planning/STATE.md` and `.planning/ROADMAP.md` were not
touched.

The live changes, with backups, Version.Index values, gates and revert lines, are in
`.planning/runbooks/traefik-edge-hardening.md` § `### P34 review fixes record` (WR-02, WR-03, IN-01) and
`### P34 WR-06 bcrypt + move record` (WR-06). They are also steps (r0)–(r3) of the Phase 34 ordered revert set.

| ID | Outcome | Commit(s) | Evidence |
|---|---|---|---|
| WR-01 | fixed (repo-only; no live change needed) | thinx-swarm `3040c06` | `restart.sh` and `thinx.sh` read the env file literally: a line reader that splits on the first `=` and runs `export "$k=$v"`, with no eval, no sourcing and no `$` expansion. An inherited `HASHED_PASSWORD` is unset first. A missing, unreadable or empty file fails closed with one stderr line. The value must be a bare apr1 or bcrypt `$2y$` hash. In `thinx.sh` all of this runs before `docker stack rm`. The `env -i` scratch matrix on script copies (docker stubbed, synthetic values) passed **20/20 under both bash 3.2 and 5.2**. Missing, empty and unreadable files give rc 1, no stdout, no env lines and no docker call. Single-quoted, double-quoted and `$$` values give rc 1. A stale inherited var with no file line gives rc 1. A stale inherited var with a valid file line uses the file's sha. Valid apr1 and valid bcrypt (CRLF, no trailing newline) give rc 0. On micro, the old and new loaders render `docker stack config` identically: 482 lines, sha `e82ca19d11fc` (in memory only; sha printed, nothing deployed) |
| WR-02 | fixed (live) | thinx-swarm `9204a8e`; this repo `06eb7e9e`, `0a5c061c`, `ac188048` | `--providers.swarm.endpoint=tcp://traefik_socket-proxy:2375`. Before the change, `nslookup` inside the Traefik task returned only `10.234.34.2` and `nc -z` showed it OPEN. `traefik-public` already has two services aliased `web`, a live example of this collision class. Backup `p34rf-wr02-traefik_traefik-20261009T175450Z.json`. The dry-run diff was exactly that one Arg, and the count stayed 24. It went live as ONE `--args` update after asserting the proxy was 1/1 and healthy: idx 38380188 → **38380330**, task `vtdqxehcuul8` → `23q5m86cc7zc`. Gate: overview `[29,0,18,6,["Swarm","File"]]`; router-name md5 `218439c68631` unchanged; time-bounded logs show 0 provider errors and 0 ERR (8 normal WRN); 7442/1883/8883 OPEN (micro-local); rtm and app 200; harness **PASS** on both paths (`p34rf-post-7442`, `p34rf-post-https`). swarm.md's rollback filter now matches by prefix |
| WR-03 | fixed (live) | thinx-swarm `a365644`; this repo `052f8b48` | `influx-auth.basicauth.removeheader=true` in `thinx.yml` and `docker-swarm.yml`. Backup `p34rf-influxrh-thinx_influxdb-20261009T175153Z.json`. Label-only change: idx 38380190 → **38380302**, task `mulafi7tbk6u` unchanged. The API reports `removeHeader: true`. `https://influx.thinx.cloud/` returns 401 with the Basic challenge, and `http://` returns 301 |
| WR-04 | fixed | this repo `43a60bea` | `RETIRED_HOSTS="micro.thinx.cloud"` gets exposure probes only, with `curl -k`. Each probe fails on Traefik API JSON at `/api/overview` or `/api/http/routers`, the `APIUrl` signature, or a 401 on `/dashboard/`, and fails closed on curl or jq errors. `HOSTS` stays at 16. A live run of the block printed `api=302 dashboard=302 sig=0` (nginx catch-all) and `EDGE-SCAN OK`. The jq predicate gives rc 0 for `{"http":…}` and for a non-empty array, and rc 1 for `[]`, HTML or an empty body |
| WR-05 | fixed | this repo `a70837ee` | `03-RsakeySpec` points `rsakey.ssh_keys` at `mkdtemp(os.tmpdir()/rsakey-spec-)` and removes it in `afterAll`. Run with `HOME=<scratch>`, `ENVIRONMENT=development` and a scratch jasmine config: 15 specs, 1 failure, which is (13) `purgeOrphanedKeys` (no CouchDB locally; pre-existing, same as in the debug notes). The **new spec leaves 0 files** in the scratch `HOME/.ssh` and 0 temp dirs; the **old spec leaves 6** (3 key pairs). The real `~/.ssh` file-name list is identical before and after (128 names, compared by `cmp`; names only, no contents read) |
| WR-06 | **fixed (live, 2026-10-11)** — bcrypt + hash moved out of the worker's bind mount | thinx-swarm `4cc2168` (docs), `5005ca0` (loader); this repo `0a5c061c`, `ac188048` (docs), `09f98bf1` (mirror), the WR-06 records commit | **bcrypt:** the hash was made on micro from line 1 of the operator file (stdin only) with python3 `bcrypt` 3.2.2, cost 12, `$2b$`→`$2y$`; `checkpw` right=True, wrong=False. **Same password as the 2026-10-09 rotation** (it passed the apr1 labels before the change), so it was re-hashed, not rotated. Labels applied label-only at 17:01:16Z after `600` spec backups (`/mnt/data/edge-rollback/p34-wr06-20261011T170115Z/`): sha12 `79e078373496` → **`4b8f8bbd91b2`** on both, `thinx_couchdb` idx 38380400 → **38380569**, `thinx_influxdb` 38380400 → **38380570**, tasks unchanged. Gate: both middlewares enabled, users 1, removeHeader true, `$apr1$` 0; overview `[29,0,18,6,["Swarm","File"]]`, 0 non-enabled routers; in the Traefik netns the password passes (db 200 + CouchDB welcome, influx 200, challenge 0); a wrong password and no credential get 401 + `Basic realm="traefik"`; laptop https 401 + challenge, http 301; 7442/1883/8883 OPEN from the laptop to the public IP; 0 Traefik ERR; harness **PASS** ×2 (`p34wr06-post-7442`, `p34wr06-post-https`). **Move:** the new store is `/mnt/gluster/deployment/secrets/edge-basicauth` (dir 700, file 600 root). Of all 22 services and both nodes' standalone containers, none binds that path; only three single files under `deployment/swarm/` are bound. It is outside the git checkout, core sees the same modes, and a non-root `ls` is denied. `restart.sh` / `thinx.sh` (`5005ca0`): one literal reader for both files, `HASHED_PASSWORD` comes only from the secrets file (an env-file line is ignored), they fail closed on missing/unreadable/empty or a group/other-readable secrets file, accept **only** `$2y$` with cost 10–31 (apr1 refused), all before `docker stack rm`. `env -i` matrix **76/76 PASS** (19 cases × 2 scripts × bash 3.2/5.2). Render check: the old loader + env file reproduces live `79e078373496` (method proven); the new loader renders `4b8f8bbd91b2` == expected in both scripts; the masked render `3c6b08e395fc` is identical, so only the 4 `basicauth.users` lines changed; this was repeated after the micro ff and after the env-line removal. Env file: the `HASHED_PASSWORD` line was removed with awk after a backup (62 → 61 lines, 1783 → 1729 B, 600 root, diff = that one line). Inside `thinx_worker`: `grep -c HASHED_PASSWORD` = **0** (also across `.env*` and the small dirs), secrets path not visible, 0 mountinfo lines. Plaintext shredded at 17:03:15Z (absent on micro and core). **Residual:** the hash is a service label, so the worker can still read it through its rw `docker.sock` (key seen 2× in `/services/thinx_couchdb`); bcrypt is the mitigation there. The password's apr1 hash was worker-readable 2026-10-09 16:07Z → 2026-10-11 17:02Z, so rotate the password if that window matters. Record and revert: runbook `### P34 WR-06 bcrypt + move record`, revert-set step (r0) |
| IN-01 | fixed (live) | thinx-swarm `9204a8e`, `51ff67f`; this repo `06eb7e9e`, `61befe53`, `ac188048` | Added a real healthcheck, `["CMD","/healthcheck"]` (`docker exec … /healthcheck` → rc 0 first), plus `update_config.order: start-first`. The image is `FROM scratch`, and `--health-cmd` always writes `CMD-SHELL`, so the change was applied through the Engine API: dry-run diff (exactly those 2 changes), then the apply with that file. Backup `p34rf-in01-traefik_socket-proxy-20261009T175322Z.json`. idx 38380136 → **38380315**; the new task `2p48l57isdvn` was `(healthy)` before the old one stopped. Gate: proxy 1/1; `_ping` OK; `/secrets` 403; 0 Traefik log lines in the window; overview and routers unchanged |
| IN-02 | fixed | thinx-swarm `9204a8e` | `traefik.sh` refuses to run unless the docker.sock gid equals the gid in `traefik.yml`. Scratch test with a stubbed `stat`: 998 proceeds; 999 gives rc 1 and no docker call. The live socket gid on micro is 998 (`docker`). The change procedure is documented in `traefik.yml`, the README and swarm.md |
| IN-03 | fixed | thinx-swarm `9204a8e`; this repo `ac188048` | `traefik.yml`, the README and swarm.md now say that `:ro` is cosmetic and the anchored allow-list is the security boundary |
| IN-04 | fixed | thinx-swarm `9204a8e`; this repo `ac188048` | The residual exposure through `/services` and `/tasks` (Env secrets, basicauth hash labels) is documented, along with "never add a second consumer" |
| IN-05 | fixed | thinx-swarm `9204a8e`; mirror `06eb7e9e` | The `security-headers` comment now says `@file`, and the curve comment says "no curve list = Go default incl. X25519MLKEM768" |
| IN-06 | fixed | this repo `0a5c061c` | AGENTS.md's opening sentence now says "no basic-auth credential on any dashboard/API route" and points to couch-auth/influx-auth |
| IN-07 | fixed | thinx-swarm `9204a8e`; this repo `ac188048` | Step 2 of the README rotation procedure parse-checks `tls.toml` in a `--network none` throwaway before `docker config create`. Proven on micro: the tls-config-3 file prints `1`/`0`, and a copy with one broken TOML header prints `0`/`1`. No throwaway was left behind |
| IN-08 | fixed | this repo `666e5bf5` (lib + node tests), `a70837ee` (jasmine 03b) | `RSAKey.create` claims `<owner>-<ts>.pub` with an exclusive `wx` create before keygen. On a clash it moves to ts+1 ms, so the name is still `<owner>-<digits>` and `KEY_FILENAME` and the console are unchanged. The private key is written with `wx`, and a failed generation releases the claim. The API signature and response shape are unchanged. `npm run test:deploykeys`: **6/6**. The new clash test **fails on the old code** (5/6) and passes on the new. Jasmine (03b): two concurrent creates get distinct names and keep their own key material |

## Pre-existing finding surfaced while gating (not a review finding, not changed)

> **Superseded 2026-10-09 20:25Z:** `:8883` is now up. It serves MQTTS with the `thinx.cloud` cert and the same go-auth
> as `:1883`, the websockets listener `:1884` is removed, and a daily cert-sync cron runs on micro. See the hardening
> runbook, `### P34 MQTTS 8883 record`. The paragraph below describes the state before that fix.

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
- WR-06 (2026-10-11): `env -i` loader matrix → `TOTAL pass=76 fail=0`; `bash -n` + `/bin/bash -n` on `restart.sh` / `thinx.sh` (`5005ca0`) → OK; `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` → `MIRROR OK files=1`
