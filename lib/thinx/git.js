// Git fetch manager.
//
// Every git operation here runs as `git` with an argv array and no shell
// (spawn for the network operations, execFileSync for the local index read).
// No string is ever handed to a shell: url and branch arrive as single argv
// elements, byte for byte, so quoting in them means nothing (SEC-EXEC-01,
// Phase 23 D-05). Per-key SSH settings reach ssh through the environment only.

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const fs = require("fs-extra");
const exec = require("child_process");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const keyformat = require("./keyformat.js");
const Transit = require("./transit.js");

const AGENT_PREFIX = "thinx-agent-";
// Inherited variables whose name says they hold a passphrase never reach a git
// child (KEYMIG-02): the API reads no passphrase any more, but the container env
// may still carry one until the swarm wiring is removed.
const PASSPHRASE_NAME = /PASSPHRASE/i;
const AGENT_SOCKET_WAIT_MS = 2000;
const AGENT_LOAD_TIMEOUT_MS = 10000;
const AGENT_STOP_WAIT_MS = 2000;
const LAST_GOOD_KEY_TTL_S = 2592000; // 30 days (D-09)
// Transit reason classes that describe OpenBao as a whole, not one key file
// (WR-02): once one of them is seen, the next Transit key would fail the same
// way. bad_ciphertext, retired_version and a decrypt server_error stay per-key;
// key_missing (the Transit key itself is gone, D-13) is service-wide, and so is a
// server_error raised by the AppRole login (IN-10, see serviceDownFor).
const SERVICE_DOWN_REASONS = new Set(["unreachable", "sealed", "tls", "not_configured", "denied", "key_missing"]);

// True when a Transit failure says nothing will decrypt for the rest of this fetch.
function serviceDownFor(e, reason) {
	if (SERVICE_DOWN_REASONS.has(reason)) return true;
	return (reason === "server_error") && !!e && (e.op === "login");
}
// Git.failureCause codes for a clone the remote refused with this key, or that
// could not use the key at all (WR-01). Deploy keys are per-repository, so every
// key but the repository's own normally ends here; such a failure does not
// explain the build, and a Transit key that could not be decrypted still can.
const KEY_REFUSED_CAUSES = new Set(["publickey_denied", "repo_not_found_or_no_access", "key_unusable"]);

// True when a keyed clone failed for a reason of its own (WR-01): the key got
// past authentication (wrong branch, a failed pull, chmod or metadata step), or
// the attempt failed without saying why. Then the clone's error explains the
// build and keyUnavailable must not. False for a success and for a clone the
// remote refused with this key; refusals only happen in the clone stage, the
// pull runs on a checkout the key already opened.
function cloneFailedPastKey(result) {
	if (result && (result.ok === true)) return false;
	if (!result || (result.reason !== "clone_failed")) return true;
	return !KEY_REFUSED_CAUSES.has(result.cause);
}

const valid_responses = [
	"already exists and is not an empty",
	"FETCH_HEAD",
	"up-to-date",
	"Checking out files: 100%",
	"done.",
	"Cloning into"
];

// url and branch go to git as argv elements, so the only thing left to refuse
// is what git itself would read as something other than data: a leading `-`
// is parsed as an option by `pull` (clone has `--` before the url, pull has no
// equivalent for the branch refspec), and NUL/CR/LF would split log lines and
// the credential-helper protocol.
function isSafeGitValue(value) {
	if ((typeof (value) !== "string") || (value.length === 0)) return false;
	if (value.charAt(0) === "-") return false;
	if (/[\0\r\n]/.test(value)) return false;
	return true;
}

const GIT_MAX_OUTPUT = 16 * 1024 * 1024;

// Kills a detached child and everything it started. git runs ssh (or
// git-remote-http) as its own children, and signalling git alone leaves them
// running; with detached:true git leads its own process group, so the
// negative pid reaches all of them. Falls back to the child alone.
function killProcessGroup(child) {
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch (_e) {
		try { child.kill("SIGKILL"); } catch (_ignored) { /* already gone */ }
	}
}

// Runs one git command without blocking the event loop (WR-03): a remote that
// trickles bytes used to freeze every HTTP request, socket.io heartbeat and
// MQTT message of the API for as long as execFileSync waited. argv only, no
// shell. Resolves with stdout when git exits 0. Otherwise rejects with an
// Error carrying `status` (exit code or null), `signal`, `stderr` and `code`
// (ETIMEDOUT after the timeout, ENOBUFS past GIT_MAX_OUTPUT, or spawn's own
// code such as ENOENT when git is missing). On timeout or overflow the whole
// process group is SIGKILLed. The timer stays armed until the pipes close, so
// a grandchild that outlives git and holds them open is killed as well.
function runGit(args, options) {
	return new Promise((resolve, reject) => {
		let child;
		try {
			child = exec.spawn("git", args, {
				cwd: options.cwd,
				env: options.env,
				stdio: ["ignore", "pipe", "pipe"],
				detached: true,
				shell: false
			});
		} catch (e) {
			return reject(e);
		}
		let stdout = "";
		let stderr = "";
		let failure = null;
		let timer = null;
		const abort = (code) => {
			if (failure === null) failure = code;
			killProcessGroup(child);
		};
		const collect = (append) => (text) => {
			if ((stdout.length + stderr.length) > GIT_MAX_OUTPUT) return abort("ENOBUFS");
			append(text);
		};
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", collect((text) => { stdout += text; }));
		child.stderr.on("data", collect((text) => { stderr += text; }));
		if (options.timeout > 0) timer = setTimeout(() => abort("ETIMEDOUT"), options.timeout);
		let settled = false;
		const finish = (error, status, signal) => {
			if (settled) return;
			settled = true;
			if (timer !== null) clearTimeout(timer);
			if ((error === null) && (failure === null) && (status === 0)) return resolve(stdout);
			const e = error || new Error("git exited with status " + status + (signal ? " (" + signal + ")" : ""));
			if (failure !== null) e.code = failure;
			e.status = (typeof (status) === "number") ? status : null;
			e.signal = signal || null;
			e.stderr = stderr;
			reject(e);
		};
		child.on("error", (error) => finish(error, null, null));
		child.on("close", (status, signal) => finish(null, status, signal));
	});
}

// Opens a checkout for the cross-uid builders: directories 0o777, everything
// else 0o766 -- the modes chmodr(p, 0o766) produced. Not chmodr itself: its
// file step is fs.lchmod where that exists (macOS, where it opens the file
// for writing and so fails with EACCES on git's read-only 0444 objects) and
// plain, link-FOLLOWING fs.chmod everywhere else (Linux). This walk lstat()s
// every entry and skips symlinks, so fs.chmodSync only ever touches a regular
// file or directory. Throws on the first error; the caller turns that into
// `chmod_failed`.
function chmodCheckoutSync(root) {
	const pending = [root];
	while (pending.length > 0) {
		const current = pending.pop();
		const stat = fs.lstatSync(current);
		if (stat.isSymbolicLink()) continue;
		if (stat.isDirectory()) {
			fs.chmodSync(current, 0o777); // first, so the listing below is readable
			for (const name of fs.readdirSync(current)) pending.push(path.join(current, name));
		} else {
			fs.chmodSync(current, 0o766);
		}
	}
}

// One clone at a time per checkout directory (review iteration 2, WR-02).
// execFileSync used to serialise every clone for free; since git runs async
// (WR-03), two clones into one directory -- devices.attach runs
// prefetch_repository into the device's fixed deploy path, so a double submit
// or a quick re-attach is enough -- interleaved: one failed with "destination
// path already exists", and fetch's next-key attempt emptied the winner's
// checkout under its pull or its chmod walk. Each directory (path.resolve'd)
// keeps the tail of a promise chain; a task starts only after the previous one
// for that directory has settled, and the tail is released whether the task
// resolved, rejected or threw. Limits: in-process only (two API replicas on
// one data volume are not serialised against each other), and the lock ends
// when the clone does, so a caller that reads the checkout later (e.g.
// devices.updatePlatform) can still meet the next queued clone re-creating it.
const checkoutTails = new Map();

function withCheckoutLock(buildPath, task) {
	if ((typeof (buildPath) !== "string") || (buildPath.length === 0)) {
		return Promise.resolve().then(task); // cloneHoldingLock reports the bad path
	}
	const key = path.resolve(buildPath);
	const previous = checkoutTails.get(key) || Promise.resolve();
	const result = previous.then(() => task());
	const tail = result.then(() => undefined, () => undefined);
	checkoutTails.set(key, tail);
	tail.then(() => {
		if (checkoutTails.get(key) === tail) checkoutTails.delete(key);
	});
	return result;
}

// An Error whose message is its code, so no log line built from it can carry
// anything but the code (Phase 40: errors raised on the Transit-key path).
function codedError(code) {
	const e = new Error(code);
	e.code = code;
	return e;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Waits for a child to exit, at most `ms`. Resolves true when it did.
function waitForExit(child, ms) {
	if ((child.exitCode !== null) || (child.signalCode !== null)) return Promise.resolve(true);
	return new Promise((resolve) => {
		let timer = null;
		const onExit = () => { if (timer !== null) clearTimeout(timer); resolve(true); };
		child.once("exit", onExit);
		timer = setTimeout(() => { child.removeListener("exit", onExit); resolve(false); }, ms);
	});
}

// Polls for the agent socket. Throws agent_start_failed when the agent exits
// first, fails to spawn, or the socket does not appear within `ms`.
async function waitForSocket(agent, sock, ms) {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (agent.spawnFailed || (agent.exitCode !== null) || (agent.signalCode !== null)) break;
		try {
			if (fs.lstatSync(sock).isSocket()) return;
		} catch (_e) { /* not there yet */ }
		await sleep(20);
	}
	throw codedError("agent_start_failed");
}

// `ssh-add -q -` with the PEM on stdin and an env of PATH and SSH_AUTH_SOCK
// only. Its output is never read or logged. Throws agent_load_failed unless it
// exits 0 within AGENT_LOAD_TIMEOUT_MS.
function loadIntoAgent(sock, pemBuf) {
	return new Promise((resolve, reject) => {
		let child;
		try {
			child = exec.spawn("ssh-add", ["-q", "-"], {
				env: { PATH: process.env.PATH, SSH_AUTH_SOCK: sock },
				stdio: ["pipe", "ignore", "ignore"],
				shell: false
			});
		} catch (_e) {
			return reject(codedError("agent_load_failed"));
		}
		let settled = false;
		const finish = (ok) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (ok) return resolve();
			try { child.kill("SIGKILL"); } catch (_e) { /* gone */ }
			reject(codedError("agent_load_failed"));
		};
		const timer = setTimeout(() => finish(false), AGENT_LOAD_TIMEOUT_MS);
		child.on("error", () => finish(false));
		child.on("close", (status) => finish(status === 0));
		child.stdin.on("error", () => { /* EPIPE: reported through the exit status */ });
		child.stdin.end(pemBuf);
	});
}

module.exports = class Git {

	// Debug aid: a fixed cause code for a failed clone, from git's stderr. Only the code is
	// logged, never stderr itself (it can carry URLs and paths).
	static failureCause(stderr) {
		const text = (typeof stderr === "string") ? stderr : "";
		const causes = [
			[/Permission denied \(publickey/i, "publickey_denied"],
			[/Repository not found|does not exist|Could not read from remote repository/i, "repo_not_found_or_no_access"],
			[/Host key verification failed/i, "host_key_failed"],
			[/Remote branch .* not found|couldn't find remote ref/i, "branch_not_found"],
			[/could not read Username|Authentication failed|terminal prompts disabled/i, "https_auth_required"],
			[/Could not resolve host|Connection timed out|Connection refused|Network is unreachable/i, "network"],
			[/bad passphrase|incorrect passphrase|Load key .*: (invalid format|error)/i, "key_unusable"]
		];
		for (const [pattern, code] of causes) {
			if (pattern.test(text)) return code;
		}
		return text.length > 0 ? "other" : "no_stderr";
	}

	constructor(redis, options) {
		this.redis = redis;
		this.options = Object.assign({
			sshKeysDir: app_config.ssh_keys,
			seededKnownHosts: path.join(os.homedir(), ".ssh", "known_hosts"),
			learnedKnownHostsDir: path.join(app_config.data_root || "/mnt/data", "ssh_known_hosts"),
			redisTimeoutMs: 1000,
			gitTimeoutMs: 600000
		}, options || {});
	}

	// The ssh command of every keyed attempt (Phase 40, KEYENC-02). git runs
	// GIT_SSH_COMMAND through `sh -c`, so this string is shell code. It is
	// therefore a constant: per-attempt values (public key path, agent socket,
	// known_hosts files) reach it only as environment variables expanded inside
	// double quotes, and no string is ever assembled from a key path or a URL.
	//
	// Host keys (D-07/D-08): accept-new learns unknown hosts but refuses a
	// changed key. The entrypoint-seeded file is the *Global* option because
	// OpenSSH writes accept-new keys into the first UserKnownHostsFile entry;
	// as the global file it stays pinned and is never written by ssh, while
	// learned keys land in the persistent file on the data volume.
	//
	// The private key lives only in the attempt's own ssh-agent; `-i` names the
	// derived PUBLIC key, which is what makes ssh offer the agent's matching key
	// under IdentitiesOnly=yes (without it the key is silently not offered).
	// Authentication is publickey only, and BatchMode=yes: ssh never prompts.
	static get AGENT_SSH_COMMAND() {
		return 'ssh -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o BatchMode=yes -o "GlobalKnownHostsFile=$THINX_GIT_SEEDED_KNOWN_HOSTS" -o "UserKnownHostsFile=$THINX_GIT_LEARNED_KNOWN_HOSTS" -o "IdentityAgent=$SSH_AUTH_SOCK" -i "$THINX_GIT_KEY_PUB"';
	}

	// Kept for logging only (D-06). Success is decided by git's exit status and
	// Node writing basename.json, never by matching git's chatter: the old
	// output-matching made "[TODO TEST] Git response result undefined" a
	// regular sight in build logs and reported working clones as failures.
	responseWhiteBlacklist(rstring) {
		let success = false;
		if (typeof (rstring) !== "string") return success;
		for (let index in valid_responses) {
			if (rstring.indexOf(valid_responses[index]) != -1) {
				success = true;
				break;
			}
		}
		// blacklist
		let invalid_responses = ["fatal"];
		for (let index in invalid_responses) {
			if (rstring.indexOf(invalid_responses[index]) != -1) {
				success = false;
				break;
			}
		}
		return success;
	}

	// git asks GIT_ASKPASS first, then core.askPass, then SSH_ASKPASS for HTTPS
	// credentials. A neutral GIT_ASKPASS means a hostile https:// remote
	// answering 401 is never handed anything: `false` exits 1, which git treats
	// as "no credential"; GIT_TERMINAL_PROMPT=0 stops the tty fallback. An
	// askpass helper or an agent inherited from the container env is dropped
	// (T-23-02, Phase 40 T-40-08): only a Transit attempt's own agent, set by
	// agentEnv(), is used. So is any inherited variable named as a passphrase
	// (PASSPHRASE_NAME).
	baseEnv() {
		const env = Object.assign({}, process.env, {
			GIT_TERMINAL_PROMPT: "0",
			GIT_ASKPASS: "false"
		});
		for (const name of Object.keys(env)) {
			if (PASSPHRASE_NAME.test(name)) delete env[name];
		}
		delete env.SSH_ASKPASS;
		delete env.SSH_ASKPASS_REQUIRE;
		delete env.SSH_AUTH_SOCK;
		delete env.SSH_AGENT_PID;
		return env;
	}

	// Env of a Transit-key attempt (KEYENC-02): the attempt's agent socket and
	// derived public key. No SSH_ASKPASS or SSH_ASKPASS_REQUIRE, whatever the
	// process env holds (deleted again here as a guard of its own).
	agentEnv(sock, pubPath) {
		const env = Object.assign(this.baseEnv(), {
			GIT_SSH_COMMAND: Git.AGENT_SSH_COMMAND,
			SSH_AUTH_SOCK: sock,
			THINX_GIT_KEY_PUB: pubPath,
			THINX_GIT_SEEDED_KNOWN_HOSTS: this.options.seededKnownHosts,
			THINX_GIT_LEARNED_KNOWN_HOSTS: this.knownHostsFiles().learned
		});
		delete env.SSH_ASKPASS;
		delete env.SSH_ASKPASS_REQUIRE;
		return env;
	}

	// The Transit client; specs set `git.transit` to a fake (like `git.rsa`).
	transitClient() {
		if (!this.transit) this.transit = Transit.shared();
		return this.transit;
	}

	// Runs fn(sock, pubPath) with pemBuf loaded into a throwaway ssh-agent
	// (KEYENC-02). The agent runs in the foreground (-D, so the child pid is
	// the agent) on a socket inside its own mkdtemp 0700 directory, with a
	// key lifetime (-t) longer than one whole attempt as a backstop should
	// `finally` ever be skipped. The key reaches it on ssh-add's stdin, so the
	// decrypted PEM is never written anywhere; the directory holds only the
	// socket and the public key derived from the PEM (never the .pub on the
	// shared volume). In `finally` the agent is stopped, the directory removed
	// and pemBuf zeroed, whether fn resolved, rejected or threw.
	// Throws only coded errors of its own: agent_start_failed, agent_load_failed.
	async withAgent(pemBuf, fn) {
		let dir = null;
		let agent = null;
		try {
			let sock;
			try {
				dir = fs.mkdtempSync(path.join(os.tmpdir(), AGENT_PREFIX));
				sock = path.join(dir, "agent.sock");
				const lifetime = String(Math.ceil((2 * this.options.gitTimeoutMs) / 1000) + 60);
				agent = exec.spawn("ssh-agent", ["-D", "-a", sock, "-t", lifetime], {
					env: { PATH: process.env.PATH },
					stdio: "ignore",
					shell: false
				});
			} catch (_e) {
				throw codedError("agent_start_failed");
			}
			agent.on("error", () => { agent.spawnFailed = true; });
			await waitForSocket(agent, sock, AGENT_SOCKET_WAIT_MS);
			await loadIntoAgent(sock, pemBuf);
			let pubPath;
			try {
				const RSAKey = require("./rsakey");
				const spki = crypto.createPublicKey(pemBuf).export({ type: "spki", format: "pem" });
				pubPath = path.join(dir, "key.pub");
				fs.writeFileSync(pubPath, RSAKey.toOpenSSH(spki, "thinx-agent") + "\n", { flag: "wx", mode: 0o600 });
				fs.chmodSync(pubPath, 0o600);
			} catch (_e) {
				throw codedError("agent_load_failed");
			}
			return await fn(sock, pubPath);
		} finally {
			await this.stopAgent(agent);
			this.removeAgentDir(dir);
			if (Buffer.isBuffer(pemBuf)) pemBuf.fill(0);
		}
	}

	// SIGTERM, up to AGENT_STOP_WAIT_MS for the exit, then SIGKILL.
	async stopAgent(agent) {
		if ((agent === null) || (typeof (agent.pid) !== "number")) return;
		if ((agent.exitCode !== null) || (agent.signalCode !== null)) return;
		try { agent.kill("SIGTERM"); } catch (_e) { /* gone */ }
		if (await waitForExit(agent, AGENT_STOP_WAIT_MS)) return;
		try { agent.kill("SIGKILL"); } catch (_e) { /* gone */ }
		await waitForExit(agent, AGENT_STOP_WAIT_MS);
	}

	// Removes an agent's mkdtemp directory, and only such a directory: a direct
	// child of os.tmpdir() whose name starts with AGENT_PREFIX.
	removeAgentDir(dir) {
		if ((typeof (dir) !== "string") || (dir.length === 0)) return;
		if (path.dirname(dir) !== path.resolve(os.tmpdir())) return;
		if (path.basename(dir).indexOf(AGENT_PREFIX) !== 0) return;
		try { fs.removeSync(dir); } catch (e) { console.log(`[git] removing agent dir failed: ${e.code || "error"}`); }
	}

	// Known-hosts files for one keyed attempt (D-07, D-08); called before
	// every use. Returns { seeded, learned, persistent, reason } and never
	// throws.
	//
	// OpenSSH reads the user known_hosts files before the global one and
	// accepts a host whose key matches an entry in ANY of them. A single
	// planted line in the learned file would therefore override the pinned
	// seed for that host -- and the data volume it lives on has been
	// world-writable (drw-rw-rw-). These checks are what keep the seeded file
	// authoritative: the learned file is used only when neither it nor its
	// directory is a symlink, group/world-writable, or owned by someone else.
	// A failing check is never repaired (a repaired file may already carry a
	// planted key); the attempt falls back to the container-local seeded file
	// for both options and new host keys are simply not persisted.
	knownHostsFiles() {
		const seeded = this.options.seededKnownHosts;
		const dir = this.options.learnedKnownHostsDir;
		const file = path.join(dir, "known_hosts");
		const fallback = (reason) => {
			console.log(`[git] learned known_hosts unusable (${reason}); using container-local ${seeded}`);
			return { seeded: seeded, learned: seeded, persistent: false, reason: reason };
		};
		try {
			if (!fs.existsSync(dir)) {
				try {
					fs.mkdirSync(dir, { mode: 0o700 });
					fs.chmodSync(dir, 0o700); // mkdirSync's mode is subject to umask
				} catch (_e) {
					return fallback("mkdir_failed");
				}
			}
			const d = fs.lstatSync(dir);
			if (d.isSymbolicLink()) return fallback("dir_symlink");
			if (!d.isDirectory()) return fallback("dir_not_directory");
			if ((d.mode & 0o022) !== 0) return fallback("dir_writable_by_others");
			if (d.uid !== process.getuid()) return fallback("dir_wrong_owner");

			let f = null;
			try {
				f = fs.lstatSync(file);
			} catch (_e) {
				// O_EXCL: never follows or reuses something that appeared meanwhile
				try {
					fs.closeSync(fs.openSync(file, "wx", 0o600));
					fs.chmodSync(file, 0o600);
				} catch (e) {
					if (e.code !== "EEXIST") return fallback("mkdir_failed");
				}
				f = fs.lstatSync(file);
			}
			if (f.isSymbolicLink()) return fallback("file_symlink");
			if (!f.isFile()) return fallback("file_not_regular");
			if ((f.mode & 0o022) !== 0) return fallback("file_writable_by_others");
			if (f.uid !== process.getuid()) return fallback("file_wrong_owner");

			return { seeded: seeded, learned: file, persistent: true, reason: null };
		} catch (_e) {
			return fallback("mkdir_failed");
		}
	}

	// The one clone routine for the public and the private path (D-05).
	// Resolves { ok, repoPath, reason } and never rejects. Success means git
	// exited 0 for clone and pull and Node wrote basename.json (D-06).
	// Async so the API keeps serving while git talks to the remote (WR-03);
	// callers await it before touching the checkout.
	//
	// core.symlinks=false is passed three times on purpose (SEC-PATH-02, D-13):
	// `-c` covers the clone process, `--config` persists it in the checkout for
	// every later git command there, and the pull gets its own `-c` because it
	// also fetches submodules. Repository symlinks arrive as plain files that
	// contain the link text.
	//
	// Takes the per-directory checkout lock (WR-02, withCheckoutLock above), so
	// a second clone into the same buildPath waits for the first to settle.
	cloneRepository(buildPath, url, branch, env) {
		return withCheckoutLock(buildPath, () => this.cloneHoldingLock(buildPath, url, branch, env));
	}

	// The body of cloneRepository. The caller must already hold the checkout
	// lock for buildPath: cloneRepository and fetch take it, and fetch calls
	// this directly because the lock is not re-entrant.
	async cloneHoldingLock(buildPath, url, branch, env) {
		if (!isSafeGitValue(url) || !isSafeGitValue(branch)) {
			console.log("[git] clone refused: invalid_input");
			return { ok: false, repoPath: null, reason: "invalid_input" };
		}
		const options = {
			cwd: buildPath,
			env: env || this.baseEnv(),
			timeout: this.options.gitTimeoutMs
		};
		let stage = "clone_failed";
		try {
			// replaces the old `rm -rf ./*`
			fs.emptyDirSync(buildPath);
			await runGit([
				"-c", "core.symlinks=false",
				"-c", "protocol.ext.allow=never",
				"clone", "--config", "core.symlinks=false",
				"--branch", branch, "--", url
			], options);

			const directories = fs.readdirSync(buildPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
			if (directories.length < 1) {
				console.log("[git] clone produced no checkout directory");
				return { ok: false, repoPath: null, reason: "no_checkout" };
			}
			const repoPath = path.join(buildPath, directories[0].name);

			stage = "pull_failed";
			await runGit([
				"-c", "core.symlinks=false",
				"-c", "protocol.ext.allow=never",
				"pull", "origin", branch, "--recurse-submodules", "--rebase"
			], Object.assign({}, options, { cwd: repoPath }));

			// replaces the old `chmod -R 666 *`, which stripped the execute
			// bit from directories. Synchronous and part of the success
			// contract (CR-01): the old shell ran `chmod -R` before returning,
			// while the async chmodr that first replaced it kept walking after
			// `ok: true` -- Sources.add removed the tree under it (ENOENT in
			// production), and a build could start while the modes were still
			// changing. It runs before basename.json is written, because
			// prefetchPrivate treats that file as "a clone already succeeded".
			stage = "chmod_failed";
			chmodCheckoutSync(repoPath);

			// replaces the old `printf ... > ../basename.json`
			stage = "metadata_failed";
			fs.writeFileSync(
				path.join(buildPath, "basename.json"),
				JSON.stringify({ basename: path.basename(repoPath), branch: branch })
			);

			return { ok: true, repoPath: repoPath, reason: null };
		} catch (e) {
			// Never log env: on keyed attempts it names the agent socket and key paths.
			const stderr = (e && typeof (e.stderr) === "string") ? e.stderr : "";
			const cause = Git.failureCause(stderr);
			console.log(`[git] git_fetch_exception ${stage} code=${e && e.code} status=${e && e.status} ` +
				`cause=${cause} ` +
				`stderr_matches_success_pattern=${this.responseWhiteBlacklist(stderr)}`);
			// cause is the fixed code only, never stderr (fetchHoldingLock reads it, WR-01).
			return { ok: false, repoPath: null, reason: stage, cause: cause };
		}
	}

	// Paths of the index entries with mode 120000 (D-13). With
	// core.symlinks=false those were written as plain files holding the link
	// text, so a build that relied on them breaks; builder.js names them in
	// the build log. Only a checkout's own index is read: without a .git
	// entry here, git would walk up and report some enclosing repository.
	// Returns [] on any error and never throws.
	symlinkEntries(repoPath) {
		try {
			if ((typeof (repoPath) !== "string") || !fs.existsSync(path.join(repoPath, ".git"))) return [];
			const out = exec.execFileSync("git", ["ls-files", "-s", "-z"], {
				cwd: repoPath,
				env: this.baseEnv(),
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				maxBuffer: 16 * 1024 * 1024
			});
			return out.split("\0")
				.filter((entry) => entry.indexOf("120000 ") === 0)
				.map((entry) => entry.slice(entry.indexOf("\t") + 1));
		} catch (e) {
			console.log(`[git] listing symlink entries failed: ${e.message}`);
			return [];
		}
	}

	// Key file names for this owner, in rsakey order. An empty owner would
	// match every key in the directory (indexOf("") === 0), so it gets none.
	keyNamesForOwner(owner) {
		if ((typeof (owner) !== "string") || (owner.length === 0)) return [];
		try {
			if (typeof (this.rsa) === "undefined") {
				const RSAKey = require("./rsakey");
				this.rsa = new RSAKey();
			}
			const names = this.rsa.getKeyPathsForOwner(owner);
			return Array.isArray(names) ? names : [];
		} catch (e) {
			console.log(`[git] listing keys failed: ${e.message}`);
			return [];
		}
	}

	// Last-successful key first (D-09). Redis holds only the key's file name
	// under gitkey:<owner>. The value is used only when it is === one of this
	// owner's own key names, and it is never joined into a path otherwise, so
	// a poisoned Redis cannot select another owner's key or a traversal path;
	// at worst it reorders this owner's attempts. A miss, an error or no
	// answer within redisTimeoutMs keeps the rsakey order.
	async orderKeys(owner, keyNames) {
		if (!Array.isArray(keyNames) || (keyNames.length < 2) || !this.redis) return keyNames;
		let timer = null;
		try {
			const value = await Promise.race([
				new Promise((resolve) => {
					this.redis.get("gitkey:" + owner, (error, result) => resolve(error ? null : result));
				}),
				new Promise((resolve) => {
					timer = setTimeout(() => resolve(null), this.options.redisTimeoutMs);
				})
			]);
			if ((typeof (value) === "string") && keyNames.includes(value)) {
				return [value].concat(keyNames.filter((name) => name !== value));
			}
		} catch (e) {
			console.log(`[git] last-good key lookup failed: ${e.message}`);
		} finally {
			if (timer !== null) clearTimeout(timer);
		}
		return keyNames;
	}

	// Stores the file name only -- never key material or ciphertext.
	// Concurrent writers are last-writer-wins, which only reorders attempts.
	rememberKey(owner, keyName) {
		if (!this.redis) return;
		try {
			this.redis.set("gitkey:" + owner, keyName, "EX", LAST_GOOD_KEY_TTL_S, (error) => {
				if (error) console.log(`[git] remembering last-good key failed: ${error.message || error}`);
			});
		} catch (e) {
			console.log(`[git] remembering last-good key failed: ${e.message}`);
		}
	}

	// Resolves true only when a clone succeeded (D-06); never rejects. The
	// boolean contract of sources.js and devices.js; builder.js reads the
	// detailed form below.
	fetch(owner, url, branch, buildPath) {
		return this.fetchDetailed(owner, url, branch, buildPath).then((r) => r.ok === true);
	}

	// Resolves { ok, keyUnavailable } and never rejects (Phase 40, D-01/D-04).
	// keyUnavailable is the reason class of the first Transit key OpenBao could
	// not decrypt, unless a clone failed for a reason of its own (WR-01,
	// cloneFailedPastKey): a key that got past authentication and then hit a
	// missing branch is the cause, so keyUnavailable is null. A key the remote
	// refused (publickey denied, repository not found) does not count: deploy
	// keys are per-repository, so the other keys of an owner are refused as a
	// rule, and the undecryptable Transit key may be the repository's own.
	// Without keys there is one keyless attempt. Otherwise each Transit key
	// gets one attempt with its own ssh-agent, removed in `finally` even when
	// the attempt throws. Every other file is skipped and logged with its cause
	// (D-09): a legacy PEM key, restored from an old backup for example, is
	// `legacy_format_unsupported`. It gets no attempt, sets no keyUnavailable,
	// raises no alert, and is never deleted or rewritten here; the owner's
	// other keys are still tried.
	//
	// All attempts run under one checkout lock for buildPath (WR-02): a
	// concurrent fetch into the same directory waits until this one is done
	// with every key, so its next-key emptyDirSync can never wipe a checkout
	// another fetch just reported as good. Stated bound (D-02): Transit gives
	// up on one key after at most four requests of requestTimeoutMs (12 s), so
	// a keyed fetch spends at most 12 s per Transit key on OpenBao, under this
	// directory's lock only, before it reaches the next key. WR-02: after the
	// first service-level failure (SERVICE_DOWN_REASONS) the remaining Transit
	// keys of this fetch are skipped without a request, so an outage costs one
	// key's 12 s per fetch, not 12 s per key.
	fetchDetailed(owner, url, branch, buildPath) {
		return withCheckoutLock(buildPath, () => this.fetchHoldingLock(owner, url, branch, buildPath));
	}

	// One attempt with a Transit key (KEYENC-02, D-01). Resolves
	// { ok, unavailable, failedPastKey, serviceDown }: ok when the clone succeeded,
	// unavailable the reason class when OpenBao could not decrypt the key (then
	// no attempt is made), failedPastKey when the clone with the loaded key
	// failed for a reason of its own (cloneFailedPastKey, WR-01), serviceDown
	// when the failure applies to every Transit key (serviceDownFor, IN-10).
	// A key OpenBao cannot decrypt is skipped with its reason class and the
	// caller goes on to the next key; so is one whose agent could not be
	// started or loaded. Never logs ciphertext, key material or an error
	// message from this path.
	async transitAttempt(owner, name, ciphertext, url, branch, buildPath) {
		let pem;
		try {
			pem = await this.transitClient().decryptKey(ciphertext);
		} catch (e) {
			const reason = (e instanceof Transit.TransitError) ? e.reason : "server_error";
			console.log(`[git] key ${name} skipped: deploy key unavailable: ${reason}`);
			return { ok: false, unavailable: reason, failedPastKey: false, serviceDown: serviceDownFor(e, reason) };
		}
		let failedPastKey = false;
		try {
			const result = await this.withAgent(pem, async (sock, pubPath) => {
				failedPastKey = true; // stays true if the clone throws
				const r = await this.cloneHoldingLock(buildPath, url, branch, this.agentEnv(sock, pubPath));
				failedPastKey = cloneFailedPastKey(r);
				return r;
			});
			if (result && result.ok === true) {
				this.rememberKey(owner, name);
				return { ok: true, unavailable: null, failedPastKey: false, serviceDown: false };
			}
		} catch (e) {
			if (e && ((e.code === "agent_start_failed") || (e.code === "agent_load_failed"))) {
				console.log(`[git] key ${name} skipped: ${e.code}`);
			} else {
				// T-40-12: a fixed token; the message of an arbitrary error may carry
				// paths or key details.
				console.log(`[git] fetch attempt with key ${name} failed: attempt_error`);
			}
		}
		return { ok: false, unavailable: null, failedPastKey: failedPastKey, serviceDown: false };
	}

	async fetchHoldingLock(owner, url, branch, buildPath) {
		let keyUnavailable = null;
		let serviceDown = null; // WR-02: the outage reason once one is seen
		let failedPastKey = false; // WR-01: did a clone fail for a reason of its own?
		// A clone that failed past its key explains the build; a skipped
		// Transit key does not then (keyUnavailable null). A refused key does
		// not count: with per-repository deploy keys, it is the normal outcome.
		const failed = () => ({ ok: false, keyUnavailable: failedPastKey ? null : keyUnavailable });
		try {
			const names = this.keyNamesForOwner(owner);
			if (names.length < 1) {
				console.log("ℹ️ [info] [git] no_rsa_keys_found");
				const ok = (await this.cloneHoldingLock(buildPath, url, branch, this.baseEnv())).ok === true;
				return { ok: ok, keyUnavailable: null };
			}
			for (const name of await this.orderKeys(owner, names)) {
				const keyPath = path.join(this.options.sshKeysDir, name);
				// Classified at attempt time, by content (KEYENC-06): a file
				// rewritten since the listing takes the path of what it holds now.
				const key = keyformat.readKey(keyPath);
				if (key.kind === "transit") {
					if (serviceDown !== null) {
						console.log(`[git] key ${name} skipped: deploy key unavailable: ${serviceDown}`);
						continue;
					}
					const attempt = await this.transitAttempt(owner, name, key.text, url, branch, buildPath);
					if (attempt.ok) return { ok: true, keyUnavailable: null };
					if (attempt.failedPastKey) failedPastKey = true;
					if ((keyUnavailable === null) && attempt.unavailable) keyUnavailable = attempt.unavailable;
					// A per-key failure (bad_ciphertext, retired_version, a decrypt
					// server_error) says nothing about the next key; an outage class
					// or a failed login applies to all of them.
					if (attempt.serviceDown) serviceDown = attempt.unavailable;
					continue;
				}
				// Anything but Transit ciphertext is skipped (D-09). The legacy read
				// path is gone (KEYMIG-02), so a PEM key cannot be used; it is left
				// exactly as it is, for the operator to decide on.
				const cause = (key.kind === "legacy") ? "legacy_format_unsupported" : key.cause;
				console.log(`[git] key ${name} skipped: ${cause}`);
			}
			return failed();
		} catch (e) {
			console.log(`[git] fetch failed: ${e.message}`);
			return failed();
		}
	}
};
