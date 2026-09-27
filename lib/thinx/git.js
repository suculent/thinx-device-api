// Git fetch manager.
//
// Every git operation here runs as `execFileSync("git", argv)`. No string is
// ever handed to a shell: url and branch arrive as single argv elements, byte
// for byte, so quoting in them means nothing (SEC-EXEC-01, Phase 23 D-05).
// Per-key SSH settings reach ssh through the environment only.

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const fs = require("fs-extra");
const exec = require("child_process");
const os = require("os");
const path = require("path");
const chmodr = require("chmodr");
const { readSecret } = require("./secrets.js");

const ASKPASS_PREFIX = "thinx-askpass-";
const LAST_GOOD_KEY_TTL_S = 2592000; // 30 days (D-09)

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

module.exports = class Git {

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

	// git runs GIT_SSH_COMMAND through `sh -c`, so this string is shell code.
	// It is therefore a constant: per-attempt values (key path, known_hosts
	// files) reach it only as environment variables expanded inside double
	// quotes, and no string is ever assembled from a key path or a URL.
	//
	// Host keys (D-07/D-08): accept-new learns unknown hosts but refuses a
	// changed key. The entrypoint-seeded file is the *Global* option because
	// OpenSSH writes accept-new keys into the first UserKnownHostsFile entry;
	// as the global file it stays pinned and is never written by ssh, while
	// learned keys land in the persistent file on the data volume.
	//
	// Authentication is publickey only. SSH_ASKPASS is forced for the whole
	// ssh process, so without this a hostile server offering password or
	// keyboard-interactive auth would be handed the key passphrase by the
	// askpass helper as if it were the account password.
	static get SSH_COMMAND() {
		return 'ssh -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o "GlobalKnownHostsFile=$THINX_GIT_SEEDED_KNOWN_HOSTS" -o "UserKnownHostsFile=$THINX_GIT_LEARNED_KNOWN_HOSTS" -i "$THINX_GIT_KEY"';
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
	// credentials. Keyed attempts set SSH_ASKPASS for the whole clone, so
	// without a neutral GIT_ASKPASS a hostile https:// remote answering 401
	// would be handed the key passphrase as a password. `false` exits 1, which
	// git treats as "no credential"; GIT_TERMINAL_PROMPT=0 stops the tty
	// fallback. The passphrase itself is only ever added by sshEnv().
	baseEnv() {
		const env = Object.assign({}, process.env, {
			GIT_TERMINAL_PROMPT: "0",
			GIT_ASKPASS: "false"
		});
		delete env.GIT_KEY_PASSPHRASE;
		return env;
	}

	sshEnv(keyPath, askpassPath) {
		return Object.assign(this.baseEnv(), {
			GIT_SSH_COMMAND: Git.SSH_COMMAND,
			THINX_GIT_KEY: keyPath,
			THINX_GIT_SEEDED_KNOWN_HOSTS: this.options.seededKnownHosts,
			THINX_GIT_LEARNED_KNOWN_HOSTS: this.knownHostsFiles().learned,
			SSH_ASKPASS: askpassPath,
			SSH_ASKPASS_REQUIRE: "force",
			GIT_KEY_PASSPHRASE: readSecret("GIT_KEY_PASSPHRASE") || ""
		});
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
	// Returns { ok, repoPath, reason } and never throws. Success means git
	// exited 0 for clone and pull and Node wrote basename.json (D-06).
	//
	// core.symlinks=false is passed three times on purpose (SEC-PATH-02, D-13):
	// `-c` covers the clone process, `--config` persists it in the checkout for
	// every later git command there, and the pull gets its own `-c` because it
	// also fetches submodules. Repository symlinks arrive as plain files that
	// contain the link text.
	cloneRepository(buildPath, url, branch, env) {
		if (!isSafeGitValue(url) || !isSafeGitValue(branch)) {
			console.log("[git] clone refused: invalid_input");
			return { ok: false, repoPath: null, reason: "invalid_input" };
		}
		const options = {
			cwd: buildPath,
			env: env || this.baseEnv(),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: this.options.gitTimeoutMs,
			maxBuffer: 16 * 1024 * 1024
		};
		let stage = "clone_failed";
		try {
			// replaces the old `rm -rf ./*`
			fs.emptyDirSync(buildPath);
			exec.execFileSync("git", [
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
			exec.execFileSync("git", [
				"-c", "core.symlinks=false",
				"-c", "protocol.ext.allow=never",
				"pull", "origin", branch, "--recurse-submodules", "--rebase"
			], Object.assign({}, options, { cwd: repoPath }));

			// replaces the old `printf ... > ../basename.json`
			stage = "metadata_failed";
			fs.writeFileSync(
				path.join(buildPath, "basename.json"),
				JSON.stringify({ basename: path.basename(repoPath), branch: branch })
			);

			// replaces the old `chmod -R 666 *`, which stripped the execute
			// bit from directories
			chmodr(repoPath, 0o766, (chmod_error) => {
				if (chmod_error) console.log("[git] chmodr failed after fetch:", chmod_error.message);
			});
			return { ok: true, repoPath: repoPath, reason: null };
		} catch (e) {
			// Never log env: on keyed attempts it carries the passphrase.
			const stderr = (e && typeof (e.stderr) === "string") ? e.stderr : "";
			console.log(`[git] git_fetch_exception ${stage} code=${e && e.code} status=${e && e.status} ` +
				`stderr_matches_success_pattern=${this.responseWhiteBlacklist(stderr)}`);
			return { ok: false, repoPath: null, reason: stage };
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

	// The helper lives in the container's own tmpdir, not next to the key in
	// app_config.ssh_keys. That directory is a shared data volume -- it is
	// world-writable in existing deployments (drw-rw-rw-) and may be mounted
	// noexec, in which case ssh could not exec the helper at all and would
	// silently offer no key.
	//
	// Each attempt gets its own mkdtemp directory (0700). The old helper name
	// was derived from the key file name, so two concurrent fetches with the
	// same key shared -- and deleted -- one file.
	//
	// The helper reads the passphrase from the environment it is exec'd with
	// rather than baking it into the file. A crashed fetch leaves a helper
	// behind, and a copy carrying the passphrase in cleartext is precisely what
	// the stale ssh_keys/askpass.sh (`echo "thinx"`) was.
	create_askfile() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), ASKPASS_PREFIX));
		const file = path.join(dir, "askpass.sh");
		const contents = `#!/bin/sh\nprintf '%s\\n' "$GIT_KEY_PASSPHRASE"\n`;
		fs.writeFileSync(file, contents, { mode: 0o700 });
		fs.chmodSync(file, 0o700); // writeFileSync's mode is subject to umask
		return file;
	}

	// Removes the helper's whole mkdtemp directory, and only such a directory.
	delete_askfile(file) {
		if ((typeof (file) !== "string") || (file.length === 0)) return;
		const dir = path.dirname(file);
		if (path.dirname(dir) !== path.resolve(os.tmpdir())) return;
		if (path.basename(dir).indexOf(ASKPASS_PREFIX) !== 0) return;
		fs.removeSync(dir);
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

	// Stores the file name only -- never key material or the passphrase.
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

	// Resolves true only when a clone succeeded (D-06); never rejects.
	// Without keys there is one keyless attempt. Otherwise each key gets one
	// attempt with its own askpass helper, removed in `finally` even when the
	// attempt throws.
	async fetch(owner, url, branch, buildPath) {
		try {
			const names = this.keyNamesForOwner(owner);
			if (names.length < 1) {
				console.log("ℹ️ [info] [git] no_rsa_keys_found");
				return this.cloneRepository(buildPath, url, branch, this.baseEnv()).ok === true;
			}
			for (const name of await this.orderKeys(owner, names)) {
				const keyPath = path.join(this.options.sshKeysDir, name);
				let askpass = null;
				try {
					askpass = this.create_askfile();
					if (this.cloneRepository(buildPath, url, branch, this.sshEnv(keyPath, askpass)).ok === true) {
						this.rememberKey(owner, name);
						return true;
					}
				} catch (e) {
					console.log(`[git] fetch attempt with key ${name} failed: ${e.message}`);
				} finally {
					if (askpass !== null) this.delete_askfile(askpass);
				}
			}
			return false;
		} catch (e) {
			console.log(`[git] fetch failed: ${e.message}`);
			return false;
		}
	}
};
