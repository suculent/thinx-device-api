# Phase 23: Build-Pipeline Sink Hardening - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 11
**Analogs found:** 10 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/thinx/git.js` (modify) | service | file-I/O + process exec | `lib/thinx/builder.js` `prefetchPublic`/`runGitCommand`/`writeBasenameMetadata` (L419-463) | exact (argv routine to reuse) |
| `lib/thinx/builder.js` (modify) | service | request-response + event (socket job) | itself: `runShell` L346-380 (argv, `shell:false`) | exact |
| `lib/thinx/<contained-path>.js` (new, e.g. `safepath.js`) | utility | transform/file-I/O guard | `lib/thinx/secrets.js` `readSecret` containment (L22-31) + `lib/thinx/finder.js` module shape | role-match |
| `lib/thinx/sanitka.js` (maybe add strict `owner`) | utility | transform | `Sanitka.udid` L91-106, `Sanitka.document_id` L119-133 | exact |
| `lib/thinx/finder.js` (possibly only consumer, no change) | utility | file-I/O | itself (symlinks not followed, L9-11) | n/a |
| `services/worker/class.js` (submodule, modify) | service | event-driven (socket.io `job`) | itself: `validateJob` L39-81, `isArgumentSafe` L113-122, `runShell` L124-163 | exact |
| `docker-entrypoint.sh` (maybe modify, D-08 dir) | config | batch | itself L27-66 (known_hosts seeding) | exact |
| `package.json` / `package-lock.json` | config | n/a | remove `"shell-escape": "^0.2.0"` (package.json:68) | n/a |
| `spec/jasmine/GitSpec.js` (modify) | test | - | itself L1-40 | exact |
| `spec/jasmine/XBuilderSpec.js` (modify) | test | - | itself L1-40 (Redis bootstrap) | exact |
| `spec/jasmine/<ContainedPath>Spec.js`, `SanitkaSpec.js`, `FinderSpec.js` | test | - | `FinderSpec.js` / `SanitkaSpec.js` | role-match |
| `23-SAST-DELTA.md` | doc | - | `.planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md` | exact (format) |
| Redis last-successful-key cache (D-09) | store | CRUD (get/set) | `lib/thinx/apikey.js` L36-40, L52, L99 | exact |

Tracked-source check: `services/worker/class.js` is tracked in the worker submodule (`git ls-files class.js` from within `services/worker`). All other paths are tracked parent-repo sources.

## Pattern Assignments

### `lib/thinx/git.js` (service, process exec) — D-05, D-06, D-07, D-08, D-09, D-13

**Analog:** `lib/thinx/builder.js` L419-463 (the public argv flow to become the shared routine)

```js
runGitCommand(repoPath, gitArgs) {                       // builder.js:419
	return exec.execFileSync("git", gitArgs, { cwd: repoPath, encoding: "utf8" }).trim();
}
writeBasenameMetadata(buildPath, repoPath, branch) {      // builder.js:426
	fs.writeFileSync(path.join(buildPath, "basename.json"),
		JSON.stringify({ basename: path.basename(repoPath), branch: branch }));
}
prefetchPublic(buildPath, sanitized_url, sanitized_branch) {   // builder.js:436
	try {
		fs.emptyDirSync(buildPath);                                   // replaces `rm -rf ./*`
		exec.execFileSync("git", ["clone", sanitized_url, "-b", sanitized_branch], { cwd: buildPath, encoding: "utf8" });
		const directories = this.getDirectories(buildPath);
		if (directories.length < 1) return false;
		const repoPath = path.join(buildPath, directories[0]);
		this.runGitCommand(repoPath, ["pull", "origin", sanitized_branch, "--recurse-submodules", "--rebase"]);
		this.writeBasenameMetadata(buildPath, repoPath, sanitized_branch);
		chmodr(repoPath, 0o766, (chmod_error) => { ... });            // replaces `chmod -R 666 *`
		return true;
	} catch (e) { console.log(`[builder] git_fetch_exception ${e}`); return false; }
}
```
Changes to apply: add `-c core.symlinks=false` before `clone`/`pull` args (D-13), accept an `env` option passed to `execFileSync` (`{ cwd, encoding, env: {...process.env, GIT_SSH_COMMAND, SSH_ASKPASS, SSH_ASKPASS_REQUIRE:"force", GIT_KEY_PASSPHRASE} }`), then `git ls-files -s` via `runGitCommand` and filter lines starting `120000`.

**Code being replaced (git.js):**
- `tryShellOp` L68-78 (`exec.execSync(cmd)` + `// lgtm [js/command-line-injection]`) — delete.
- `fetch` L104-146: keep the key loop skeleton (`rsa.getKeyPathsForOwner(owner)` L107-108, `app_config.ssh_keys + "/" + key_paths[kindex]` L116, `create_askfile`/`delete_askfile` L139-141) but move `delete_askfile` into `finally` and drop the `ssh-agent sh -c` script L134-137. The "no keys" branch L109-112 currently runs the command keyless — decide equivalent (plain routine without GIT_SSH_COMMAND key).
- `prefetch` L149-159 (`exec.execSync(GIT_PREFETCH)`) — remove if unused (grep callers first).
- `shellEscape` import L7 — remove.
- Keep `responseWhiteBlacklist` L21-48 for logging only (D-06); `checkResponse` L50-66 success must become "exit 0 + basename.json exists".

**Askpass helpers to keep** (git.js L85-102): per-key file in `os.tmpdir()`, mode 0700, reads `$GIT_KEY_PASSPHRASE` from env. Keep the long "why" comment style.

**Constructor gap:** `Git` has no constructor and builder.js instantiates it at module scope (`const Git = require("./git"); const git = new Git();` builder.js:23). For D-09 Redis, change to `new Git(redis)` inside `Builder` constructor (builder.js:53-58, which receives `redis` but does not store it) — follow `APIKey` constructor pattern below.

### D-09 Redis cache (inside git.js)

**Analog:** `lib/thinx/apikey.js`
```js
constructor(redis) { this.redis = redis; ... }                     // L36-40
this.redis.get("ak:" + owner_id, (error, json_keys) => { ... });  // L99 (legacy callback API)
this.redis.set("ak:" + owner_id, JSON.stringify(...), (error, result) => { if (error) console.error(...) });  // L52
```
Clients are the `redis.legacy()` callback style (see XBuilderSpec L30-33). Since `fetch` is synchronous today, either make `prefetchPrivate`/`fetch` callback/Promise-based or read the key before the sync loop. Key naming e.g. `gitkey:<owner>` (discretion); Redis error => full loop in current order.

### `readSecret` for GIT_KEY_PASSPHRASE

**Source:** `lib/thinx/secrets.js` L22-40; usage `const { readSecret } = require("./secrets.js");` (database.js:6, globals.js:98). `readSecret("GIT_KEY_PASSPHRASE")` falls back to env automatically.

### `lib/thinx/builder.js` (service) — D-01, D-05, D-10, D-11, D-12, D-13

**Remote job (D-01)** — `runRemoteShell` L196-240:
```js
const BUILD_PATH = app_config.data_root + app_config.build_root + "/" + owner + "/" + udid + "/" + build_id;  // L211 — unsanitised, apply D-12
let job = { mock:false, build_id, source_id, owner, udid, path: BUILD_PATH, cmd: CMD, secret: process.env.WORKER_SECRET || null };  // L213-222
```
Add `argv: buildArgs` (arguments only, no program). Caller at L946-965: `const remoteCommand = shellEscape(["./builder", ...buildArgs]);` (L946) → build `cmd` by `["./builder", ...buildArgs].join(" ")`; pass `buildArgs` into `runRemoteShell`. `buildArgs` built at L923-944. Note `dry_run.trim()` pushes `--dry-run`.

**Local argv exec (keep)** — `runShell` L346-380: `exec.spawn(command, args, { cwd: ROOT, shell: false })` L355. Also uses `shellEscape` for a log line at L353 — replace with `[command, ...args].join(" ")`.

**Private prefetch (D-05)** — `prefetchPrivate(br, SHELL_FETCH, BUILD_PATH)` L479-519 and callsite L668-674:
```js
const SHELL_FETCH = this.gitCloneAndPullCommand(BUILD_PATH, sanitized_url, sanitized_branch);   // L668 — delete
if (!br.is_private) this.prefetchPublic(BUILD_PATH, sanitized_url, sanitized_branch);          // L671
if (!this.prefetchPrivate(br, SHELL_FETCH, BUILD_PATH)) return callback(false, "git_fetch_failed");  // L674
```
`gitCloneAndPullCommand` L465-477 deleted. Keep the long comment at L500-509 explaining the `return true` fix.

**BUILD_PATH (D-12)** — L633: `app_config.data_root + app_config.build_root + "/" + device.owner + "/" + device.udid + "/" + sanitka.udid(build_id)`. Insert strict check before `mkdirp.sync(BUILD_PATH)` (L584) → `callback(false, "invalid_device")`. Existing early-reject style: `if ((build_id.length > 64)) return callback(false, "invalid_build_id");` (L624).

**thinx.yml read/write-back (D-10, D-11)** — L724-790: `const yml_path = XBUILD_PATH + "/thinx.yml"; fs.existsSync(...)` → `fs.readFileSync` → `fs.writeFileSync(yml_path, insecure, 'utf8')` (L786). Failure pattern to copy (L742-748):
```js
this.notify(udid, build_id, notifiers, message, false);
blog.state(build_id, owner, udid, "error");
callback(false, message);
return;
```
plus `this.cleanupSecrets(XBUILD_PATH)` (as at L815/L829).
Other guarded sinks: `environment.json` L797-800, `thinx_build.json` L857-861, header lookup, `getPlatform`/`findFilesSync` thinx.yml.

**cleanupSecrets** L975-997: `fs.unlink(env_file)` on `findFilesSync` results — add `lstat` check (unlink link itself, don't follow), no abort.

**Stale lgtm comments** to reassess (D-15): builder.js L265, L267, L289, L323; git.js L71; worker class.js L163, L221.

### New contained-path helper (utility)

**Analog for containment math:** `lib/thinx/secrets.js` L25-30
```js
const base = path.resolve(SECRETS_DIR);
const secret_path = path.resolve(base, name);
const relative = path.relative(base, secret_path);
if (relative.startsWith("..") || path.isAbsolute(relative)) { throw new Error("Invalid secret name"); }
```
Upgrade to `fs.realpathSync` on both base and parent, `relative === ""`/`..`-prefix/absolute rejection (path.relative already defeats `abc` vs `abc-evil` prefix-siblings), and `fs.lstatSync(final).isSymbolicLink()` reject.
**Module shape:** copy `lib/thinx/finder.js` L1-15 (`'use strict'`, JSDoc header, plain named-function exports, "Never throws" contract documented).

### `lib/thinx/sanitka.js` (D-12)

`Sanitka.udid` L91-102 already enforces length 36 + `[a-fA-F0-9-]`. `Sanitka.document_id` L119-129 uses `/^([a-z0-9]{64,})$/` (note `{64,}` = 64 *or more*, CONTEXT wants exactly 64 — add a strict owner validator or tighten, check SanitkaSpec). Static + instance wrapper pattern (L104-106).

### `services/worker/class.js` (submodule) — D-02, D-03, D-04

Current flow: `setupSocket` `socket.on('job', ...)` L341 → `runJob` L96-105 → `validateJob` L39-81 (requires `job.cmd`, `isArgumentSafe(job.cmd)`) → `runShell(job.cmd, ...)` L124-163:
```js
CMD = CMD.replace("./builder", "/opt/thinx/thinx-device-api/builder");   // L128 → becomes constant program (D-04)
let tomes = CMD.split(" ");
for (let tome of tomes) { if (tome.indexOf("--git=")!==-1 || tome.indexOf("--branch=")!==-1) { if (!this.isArgumentSafe(tome)) {... this.running=false; callback(); return;} } }
let shell = exec.spawn(command, { shell: true }); // lgtm [js/command-line-injection]   // L163
```
`isArgumentSafe` L113-122 regex `/[;&|`$()<>\n\r\\]/`. New: if `Array.isArray(job.argv)` validate each element is a string, `--`-prefixed, and `isArgumentSafe` for `--git=`/`--branch=` (at least), then `exec.spawn(PROGRAM, job.argv, { shell:false })`; else legacy `cmd` path + `console.log` warning (D-03). `validateJob` must accept argv-without-cmd. Rejection style: `this.failJob(sock, job, "reason")` L31-36. Keep the `error` handler L268-278 (ENOENT). Ship as submodule commit then parent pointer bump.

### `docker-entrypoint.sh` — D-07/D-08

L34-66: `SSH_DIR`, `mkdir -p … && chmod 700`, `touch … && chmod 600`. Same idiom for a persistent learned-hosts dir on the data volume if created at boot (API also re-checks modes at use time per D-08 using `fs.statSync(...).mode & 0o022` and `uid`).

### Specs

**XBuilderSpec.js L11-37** — Redis bootstrap to copy for any spec needing D-09:
```js
const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');
beforeAll(async() => {
  const redis_base = redis_client.createClient(Globals.redis_options());
  await redis_base.connect();
  redis = redis_base.legacy();
  builder = new Builder(redis);
```
**GitSpec.js L1-40** — `describe`/`beforeAll` console banners, `chai.expect`, `envi = require("../_envi.json")`, `Filez.deployPathForDevice(envi.oid, envi.udid)`. Existing tests call `git.fetch(owner, "<shell string>", path)` — these must be rewritten for the new signature (and note they use `expect(success === true)` which asserts nothing; use `expect(success).to.equal(true)`). Add `file://` bare-repo fixtures (create with `execFileSync("git",["init","--bare",...])` in a tmpdir), injection strings in url/branch, missing git binary (`PATH` override), symlinked thinx.yml, prefix-sibling, `../` owner/udid.
ZZ specs stay CommonJS, chai-http ^4.

## Shared Patterns

- **argv exec:** `exec.execFileSync("git", args, {cwd, encoding:"utf8"})` / `exec.spawn(cmd, args, {shell:false})` — builder.js L419-424, L355. Apply to git.js, worker.
- **Build failure reporting:** `this.notify(...,false); blog.state(build_id, owner, udid, "error"); this.cleanupSecrets(XBUILD_PATH); callback(false, reason)` — builder.js L742-748, L815, L829.
- **Secrets:** `readSecret(name)` from `lib/thinx/secrets.js`.
- **Redis:** injected legacy callback client via constructor (`apikey.js` L36-40).
- **Comment style:** long "why" comments at the sink (git.js L119-133, builder.js L500-509).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| Persistent known_hosts permission check (D-08) | utility | No existing mode/owner verification code in lib/thinx; use `fs.statSync` mode bits + `process.getuid()` |

## Metadata

**Analog search scope:** lib/thinx/, services/worker/, spec/jasmine/, docker-entrypoint.sh, package.json
**Files scanned:** 12
**Pattern extraction date:** 2026-09-27
