---
phase: "23"
slug: "build-pipeline-sink-hardening"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-28"
---

# Phase 23 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Repository owner → API (source url/branch) | The url and branch stored on a source are attacker-controlled text that reaches git | Source url, branch |
| API → git/ssh child processes | Argv and env go into child processes running as root in the API container | Git argv, SSH key paths, key passphrase (env) |
| Remote git server → API | A remote can answer with credential prompts, host keys and repository content, including symlinks | Host keys, repository tree |
| Shared data volume (`/mnt/data`) → API | World-writable in existing deployments, so files planted there (keys, known_hosts) must not be trusted | Learned known_hosts, SSH keys |
| Redis → API | Anything on the Redis network can read and write the last-good key cache | `gitkey:<owner>` key filename |
| API → worker (socket.io `job`) | Authenticated by WORKER_SECRET. The payload (argv, legacy cmd, path) goes into a root container that holds docker.sock | Job argv/cmd, WORKER_SECRET |
| Worker → bash `builder` program | Argv values reach a bash script that later evals parsed repository YAML | Builder arguments |
| Cloned repository → builder filesystem operations | Every file name, file type (including symlinks) and file content in the checkout is attacker-controlled | Repository files |
| CouchDB device record → BUILD_PATH | `device.owner`/`device.udid` build a filesystem path under the shared data volume | Owner id, udid |
| Builder → decrypted device credentials | The thinx.yml write-back puts cleartext Wi-Fi SSID/password on disk | Wi-Fi credentials (secret) |
| npm registry → build image | Removing a dependency changes the resolved tree built into the API image | Package tree |
| Local repo → GitHub (public repos) | Pushed commits and committed docs are world-readable | Source, planning docs (no secrets) |
| CI → private registry / Docker Hub → swarm | Built images reach production services | Container images |
| Operator shell → swarm managers over ssh | Root access to production nodes | Root shell |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-01 | Elevation of privilege | git.js clone/pull (url, branch) | high | mitigate | Argv-only `execFileSync` with no shell, `--` before the url, rejection of leading `-` and of NUL/newline, and `-c protocol.ext.allow=never`. Verified in `lib/thinx/git.js` and GitSpec case (c) | closed |
| T-23-02 | Information disclosure | GIT_KEY_PASSPHRASE | high | mitigate | Passphrase passes only through env to askpass; `GIT_ASKPASS=false` and `GIT_TERMINAL_PROMPT=0` are set; `baseEnv()` removes an inherited value; ssh is limited to `PreferredAuthentications=publickey` with `PasswordAuthentication=no`. Leak spec proven. Verified in `git.js` | closed |
| T-23-03 | Spoofing | ssh host verification | high | mitigate | `StrictHostKeyChecking=accept-new`, with seeded keys supplied through `GlobalKnownHostsFile`. Verified in `git.js`; checked in production (3 github.com entries) | closed |
| T-23-04 | Tampering | Redis `gitkey:<owner>` | medium | mitigate | The cached name is used only if it is exactly one of the owner's own key names, it is never joined into a path, and it carries a TTL. Verified in `git.js` | closed |
| T-23-05 | Tampering | repository symlinks at checkout | high | mitigate | `core.symlinks=false` on clone and pull, and persisted in the checkout config. D-13 build-log warning. Verified in `git.js` | closed |
| T-23-06 | Tampering | askpass helper in shared tmp | medium | mitigate | A new `mkdtemp` 0700 directory per attempt, removed in `finally`; `delete_askfile` is prefix-guarded. Verified in `git.js` | closed |
| T-23-07 | Denial of service | synchronous git in the event loop | medium | mitigate | `timeout: 600000`, a 16 MiB `maxBuffer`, and a 1 s cap on the Redis read. Verified in `git.js` | closed |
| T-23-08 | Repudiation | fetch failures | low | accept | Failures log a reason code and git's stderr verdict; the build log keeps `git_fetch_failed` | closed |
| T-23-10 | Elevation of privilege | worker spawn of API-supplied command | high | mitigate | `spawn(BUILDER_PROGRAM, argv, { shell: false })`, with each element checked by the `validateArgv` allowlist and `isArgumentSafe`. Verified in `services/worker/class.js`; production build 43c748d0 ran through `runArgv` | closed |
| T-23-11 | Elevation of privilege | legacy `cmd` shell path (D-03) | medium | mitigate | Whole-string `isArgumentSafe` check plus constant-time WORKER_SECRET auth. A `legacy cmd-only job` warning is logged, and production shows 0 such lines in 24 h. **2026-09-28, user:** there are no other API/worker deployments, so the D-01/D-03 mixed-version constraint no longer applies and the path can be removed (follow-up task) | closed |
| T-23-12 | Spoofing | forged job from a non-API socket client | high | mitigate | Fail-closed WORKER_SECRET check with `secretsMatch` (timingSafeEqual). Verified in `class.js` | closed |
| T-23-13 | Information disclosure | worker logs | low | mitigate | Job `secret` and the `--env=` value are logged as `<redacted>`. Verified in `class.js`; secret-redaction spec | closed |
| T-23-14 | Tampering | repository thinx.yml `eval` in `services/worker/builder` | high | transfer | Outside SEC-EXEC-01/02 scope. Moved to the backlog as a follow-up (see Accepted Risks / Transfers) | closed |
| T-23-20 | Information disclosure | thinx.yml credential write-back through a symlink | high | mitigate | `writeFileInside` (realpath containment, lstat, O_NOFOLLOW); refusal returns `unsafe_repository_file` and runs `cleanupSecrets`. Verified in `lib/thinx/safepath.js` and `builder.js`; BuilderPathSpec | closed |
| T-23-21 | Information disclosure | repo-file reads following symlinks | high | mitigate | `readFileInside` with O_NOFOLLOW and containment, used in platform.js and the pine64 plugin. Verified | closed |
| T-23-22 | Tampering | writes of environment.json / thinx_build.json / header | high | mitigate | `writeRepoFile` for all three, and the checkout is re-checked with `resolveInside`. Verified in `builder.js` | closed |
| T-23-23 | Tampering / EoP | owner/udid path traversal into BUILD_PATH | high | mitigate | `strictOwner` + `Sanitka.udid` + `buildPathFor` containment; `invalid_device` is returned before `createBuildPath`. Verified in `builder.js` / `sanitka.js` | closed |
| T-23-24 | Tampering | TOCTOU between lstat and open | medium | mitigate | O_NOFOLLOW on every open, and parent directories are realpath-checked. Verified in `safepath.js` | closed |
| T-23-25 | Denial of service | cleanupSecrets following links | medium | mitigate | `unlinkInside` removes the link itself, never its target, and never throws. Verified in `safepath.js` / `builder.js` | closed |
| T-23-26 | Repudiation | silent refusals / hung build requests | low | mitigate | `refuseBuild` always notifies, sets the log state to error and calls back once. Verified in `builder.js` | closed |
| T-23-30 | Elevation of privilege | remote builder command | high | mitigate | Jobs carry argv (arguments only), and the sender refuses non-`--` elements (`invalid_build_arguments`). Verified in `builder.js`; BuilderRemoteJobSpec | closed |
| T-23-31 | Denial of service | old workers after the API deploy | medium | mitigate | `legacyShellCommand` produces a byte-identical `cmd` (golden specs). Now moot: there are no other deployments (see T-23-11) | closed |
| T-23-32 | Tampering | lockfile rewrite | low | mitigate | Deletion-only lockfile diff; `shell-escape` is absent from package.json and the lockfile (grep = 0) | closed |
| T-23-33 | Tampering | submodule pointer to an unpublished worker commit | medium | mitigate | The gitlink `79611f6` equals worker `origin/main` `79611f6` | closed |
| T-23-40 | Information disclosure | committed delta doc / SUMMARY / ssh output | medium | mitigate | The delta doc holds rule ids, paths and counts only; the ssh command is loaded from `~/.aliases` at run time; `secret_hits=0` before both pushes (23-05 SUMMARY) | closed |
| T-23-41 | Denial of service | private builds broken by the new fetch path | high | mitigate | Single change window plus the D-14 real private build: `suculent/eav-firmware`, build `43c748d0-bb69-11f1-8a47-e78d11b3c5cf`, 3 environments SUCCESS. Rollback path documented | closed |
| T-23-42 | EoP / Repudiation | stack-wide redeploy resetting chronograf credentials | high | mitigate | Swarmpit auto-redeployed both services; no `restart.sh`, `docker stack deploy` or `docker service update` was run (23-05 SUMMARY) | closed |
| T-23-43 | Tampering | parent CI resolving an unpublished submodule commit | medium | mitigate | Worker pushed (CircleCI 444/445 green) before the parent push (CircleCI 15436/15437 green) | closed |
| T-23-44 | Repudiation | SAST evidence massaged by dismissals or suppressions | medium | mitigate | 0 suppression markers added in the phase diff and no dismissals this phase. The dismissed count reads 1 because of #118 (2021, in the Phase 22 baseline), a pre-existing deviation recorded in 23-SAST-DELTA.md | closed |
| T-23-45 | Spoofing | planted known_hosts on the world-writable data volume | high | mitigate | `knownHostsFiles()` checks mode, owner and symlinks, then falls back to the container file. Production result `persistent:true`, dir 700, file 600, uid 0 | closed |
| T-23-SC | Tampering | package installs / image supply chain | low | accept | The only dependency change is the removal of shell-escape; nothing was added or fetched | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-23-01 | T-23-08 | Fetch-failure observability matches the pre-phase baseline: reason code plus git's stderr verdict, and no env is logged | plan 23-01 threat model | 2026-09-28 |
| AR-23-02 | T-23-SC | No package was added or fetched in this phase; shell-escape was removed only | plan threat models | 2026-09-28 |
| TR-23-01 | T-23-14 | **Transfer to backlog.** `services/worker/builder` still runs `eval "$PARSED"` on the repository's own thinx.yml. This is outside the scope of SEC-EXEC-01/02 and needs a dedicated worker-hardening change | plan 23-02 threat model | 2026-09-28 |

**Residuals noted during the phase (not threats in this register; tracked as follow-ups):**
- **Legacy `cmd` shell path** (`services/worker/class.js` `spawn(command, { shell: true })`) and API `legacyShellCommand`: the user confirmed on 2026-09-28 that no other deployments exist. Removing both is the follow-up.
- **Broad build-dir permissions** (`0o766` files / `0o777` dirs from `chmodr`): these predate the phase. A least-privilege hardening follow-up is recorded.
- **`chmodr` race in `cloneRepository`** (23-01 regression): it adds log noise only and is being fixed in the phase-23 code-review pass.
- **Rotate `WORKER_SECRET`**: worker logs from before 23-02 contain the job secret.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-28 | 31 | 31 | 0 | /gsd-secure-phase orchestrator (ASVS L1 grep-level verification; register authored at plan time; auditor skipped per short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-28
