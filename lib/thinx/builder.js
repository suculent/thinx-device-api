/** This THiNX Device Management API module is responsible for managing builds and should be offloadable to another server. */

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const prefix = Globals.prefix();

const Filez = require("./files.js");
let ROOT = Filez.appRoot();

const { v1: uuidV1 } = require('uuid');
const { readdirSync } = require('fs');

const mkdirp = require("mkdirp");
const exec = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const { findFilesSync } = require('./finder');
const safepath = require("./safepath");
const YAML = require('yaml');
const chmodr = require('chmodr');
const AES = require("./aes");

const Git = require("./git");

const Database = require("./database");
let db_uri = new Database().uri();
let devicelib = require("./couch")(db_uri).use(prefix + "managed_devices");
let userlib = require("./couch")(db_uri).use(prefix + "managed_users");

const APIEnv = require("./apienv");
const ApiKey = require("./apikey");
const Platform = require("./platform");
const JSON2H = require("./json2h");

const BuildLog = require("./buildlog"); let blog = new BuildLog();
const Sanitka = require("./sanitka"); let sanitka = new Sanitka();
const Sources = require("./sources");

const InfluxConnector = require('./influx');
const EventTaxonomy = require('./event_taxonomy.js');
const Util = require("./util.js");
const logger = require("./logger.js");

function recordStatsEvent(owner, event, data) {
	const safeOwner = Util.isDefined(owner) ? owner : "0";
	const detail = Util.isDefined(data) ? " " + data : "";
	logger.warn(`[OID:${safeOwner}] [${event}]${detail}`);
	InfluxConnector.statsLog(safeOwner, event, data);
}

module.exports = class Builder {

	constructor(redis) {
		this.io = null;
		this.apienv = new APIEnv(redis);
		this.apikey = new ApiKey(redis);
		this.sources = new Sources();
		this.git = new Git(redis);
	}

	setIo(io) {
		this.io = io;
	}

	/* Used to decrypt secure WiFi credentials */
	decrypt(cryptokey, inputHex) {

		let plain;

		if ((typeof (inputHex) === "undefined") || (inputHex === null) ||
			(typeof (cryptokey) === "undefined") || (cryptokey === null)) {
			console.log("Fatal Error - Invalid decryption data: [" + inputHex + "] [***]");
			return plain;
		}

		plain = AES.decrypt(cryptokey, inputHex);
		if (typeof (plain) === "undefined") {
			console.log("Decryption error: ciphertext could not be decrypted with the supplied key");
		}

		return plain;
	}

	wsOK(websocket, _message, udid) {
		if (typeof (websocket) !== "undefined" && websocket !== null) {
			try {
				websocket.send(JSON.stringify({
					notification: {
						title: "Build Status",
						body: "Completed",
						type: "success",
						udid: udid,
						message: _message
					}
				}));
			} catch (e) {
				console.log(e);
			}
		}
	}

	buildGuards(callback, owner, git, branch) {
		if ((typeof (owner) === "undefined") || (owner === null)) {
			console.log("owner is undefined, exiting!");
			if (typeof (callback) !== "undefined") callback(false, "owner undefined");
			return false;
		}

		if ((typeof (git) === "undefined") || (git === null)) {
			console.log("git is undefined, exiting!");
			if ((typeof (callback) !== "undefined") && (callback !== null)) callback(false, "git undefined");
			return false;
		}

		if ((typeof (branch) === "undefined") || (branch === null)) {
			console.log("branch is undefined, exiting!");
			if ((typeof (callback) !== "undefined") && (callback !== null)) callback(false, "branch undefined");
			return false;
		}
		return true;
	}

	sendNotificationIfSocketAlive(websocket, notification) {

		if (typeof (websocket) === "undefined" || websocket === null) {
			return;
		}

		try {
			if (websocket.isAlive) {
				websocket.send(notification, function ack(/* error */) {
					/* We ignore errors here, the socket may have been closed anytime. */
				});
			} else {
				console.log("Skipping dead websocket notification.");
			}
		} catch (e) {
			console.log("[builder] ws_send_exception" + e);
		}
	}

	successStringFromBool(success) {
		let successString;
		if (success) {
			successString = "success"; // green
		} else {
			successString = "error"; // orange
		}
		return successString;
	}

	buildStatusNotification(message, messageType, udid, build_id) {
		return JSON.stringify({
			notification: this.buildNotification(message, messageType, udid, build_id)
		});
	}

	buildNotification(message, messageType, udid, build_id) {
		return {
			title: "Build Status",
			body: message.toString(),
			type: messageType,
			udid: udid,
			build_id: build_id
		};
	}

	// Used to sends a build status notification using websocket
	notify(udid, build_id, notifiers, message, success_status) {

		if ((typeof (message) === "undefined") || (message === null)) {
			console.log("[error] builder:notify - No message given in notify()");
			return;
		}

		let status = this.successStringFromBool(success_status);

		if (message.indexOf("build_running") !== -1) {
			status = "info"; // blue
		}

		if (message == "OK") {
			status = "success";
		}

		this.sendNotificationIfSocketAlive(
			notifiers.websocket,
			this.buildStatusNotification(message, status, udid, build_id)
		);
	}

	getLastAPIKey(owner, callback) {
		console.log("[builder] Fetching LAST API Key for owner " + owner);
		this.apikey.get_last_apikey(owner, callback);
	}

	// D-12: BUILD_PATH for one build of one device, or null. owner must be
	// exactly 64 [a-z0-9], udid and build_id UUID-shaped (Sanitka.udid). Values
	// are validated, never stripped, so two inputs can never share a directory,
	// and the result must resolve strictly under data_root + build_root.
	buildPathFor(owner, udid, build_id) {
		const s_owner = Sanitka.strictOwner(owner);
		const s_udid = Sanitka.udid(udid);
		const s_build = Sanitka.udid(build_id);
		if ((s_owner === null) || (s_udid === null) || (s_build === null)) return null;
		const root = path.resolve(app_config.data_root + app_config.build_root);
		const candidate = path.resolve(root, s_owner, s_udid, s_build);
		return safepath.isInside(root, candidate) ? candidate : null;
	}

	// D-01: the legacy `cmd` string of a remote job, byte-identical to what the
	// escaping package it replaces (v0.2.0, removed in Phase 23) produced for the
	// same array (golden cases in BuilderRemoteJobSpec). Only workers built before
	// argv support read `cmd`; they split it on spaces, re-join it and run it
	// with `shell: true`. A plain space-join would let that shell strip the
	// double quotes from `--env={"KEY":"value"}` and split values containing
	// spaces, which would break every build with API env vars on an old worker.
	// Algorithm: an element matching ^[A-Za-z0-9_/-]+$ passes through; anything
	// else is single-quoted with each ' written as '\'' , then a leading run of
	// empty '' pairs is dropped and \''' collapses to \'. Remove this helper
	// together with the `cmd` field once no worker logs "legacy cmd-only job".
	legacyShellCommand(args) {
		return args.map((arg) => {
			if (/^[A-Za-z0-9_/-]+$/.test(arg)) return arg;
			return ("'" + arg.replace(/'/g, "'\\''") + "'")
				.replace(/^(?:'')+/g, "")
				.replace(/\\'''/g, "\\'");
		}).join(" ");
	}

	// D-01 / D-04: buildArgs are builder arguments only (every element a string
	// starting with --). The worker owns the program path, so the job never
	// names what runs; `argv` is what current workers spawn without a shell,
	// `cmd` is kept only for workers that predate argv support.
	runRemoteShell(worker, buildArgs, owner, build_id, udid, notifiers, source_id) {

		if ((typeof (worker) === "undefined") || (typeof (worker.socket) === "undefined")) {
			let message = "ERROR: worker needs socket for remote builds";
			console.log(message);
			this.notify(
				udid,
				build_id,
				notifiers,
				message,
				this.successStringFromBool(false)
			);
			return;
		}

		// D-12: same contained path as run_build; an invalid identity emits no job.
		const BUILD_PATH = this.buildPathFor(owner, udid, build_id);
		if (BUILD_PATH === null) {
			console.log("☣️ [error] [builder] refusing remote build: invalid owner/udid/build_id");
			this.notify(udid, build_id, notifiers, "invalid_device", false);
			return;
		}

		// The sender enforces the same wire contract the worker checks: arguments
		// only, never a program path or a bare word.
		if (!Array.isArray(buildArgs) ||
			!buildArgs.every((arg) => (typeof (arg) === "string") && arg.startsWith("--"))) {
			console.log("☣️ [error] [builder] refusing remote build: build arguments must be --flags only");
			this.notify(udid, build_id, notifiers, "invalid_build_arguments", false);
			return;
		}

		let job = {
			mock: false,
			build_id: build_id,
			source_id: source_id,
			owner: owner,
			udid: udid,
			path: BUILD_PATH,
			argv: buildArgs.slice(),
			cmd: this.legacyShellCommand(["./builder", ...buildArgs]),
			secret: process.env.WORKER_SECRET || null
		};

		let copy = JSON.parse(JSON.stringify(job));
		if ((typeof (copy.secret) !== "undefined") && (copy.secret !== null)) {
			copy.secret = "****"; // mask secrets in log
		}

		if (this.io !== null) {
			this.io.emit('job', job);
		} else {
			console.log("☣️ [error] [build] io socket null");
			return;
		}

		let options = {
			owner: owner,
			build_id: build_id,
			source_id: source_id,
			udid: udid,
			notifiers: notifiers
		};

		if (typeof (worker.socket) === "undefined") {
			recordStatsEvent(owner, EventTaxonomy.NAMES.BUILD_FAILED, build_id);
			return;
		}

		worker.socket.on('log', (data) => {
			this.processShellData(options, data);
		});

		worker.socket.on('job-status', (data) => {
			// Worker sends 'job-status' on exit event, not a build-id event
			this.processExitData(owner, build_id, udid, notifiers, data);

			if (data.status == "OK") {
				this.cleanupDeviceRepositories(owner, udid, build_id);
			}
		});
		recordStatsEvent(owner, EventTaxonomy.NAMES.BUILD_STARTED, build_id);
	}

	getDirectories(source) {
		return readdirSync(source, { withFileTypes: true })
			.filter(dirent => dirent.isDirectory())
			.map(dirent => dirent.name);
	}

	// Should delete all previous repositories except for the latest build (on success only)
	cleanupDeviceRepositories(owner, udid, build_id) {

		let s_owner = sanitka.owner(owner);
		let s_udid = sanitka.udid(udid);
		let keep_build_id = sanitka.udid(build_id);

		if ((s_owner == null) || (s_udid == null)) {
			console.log("☣️ [error] cleanup failed for udid/owner and keep_build_id", udid, owner, build_id);
			return;
		}

		const device_path = app_config.data_root + "/repos" + "/" + s_owner + "/" + s_udid;
		const keep_path = device_path + "/" + keep_build_id;
		let all = this.getDirectories(keep_path);
		for (let index in all) {
			let directory = all[index];
			if (directory.indexOf(keep_build_id) == -1) {
				let delete_path = device_path + "/" + directory;
				fs.remove(delete_path);
			}
		}
	}

	processExitData(owner, build_id, udid, notifiers, data) {
		if ((typeof (data.status) !== "undefined") &&
			(data.status != null) &&
			(data.status.indexOf("OK") == 0)) {
			this.cleanupDeviceRepositories(owner, udid, build_id);
		}
		this.notify(udid, build_id, notifiers, data.status, false);
		if (data.status !== "OK") {
			blog.state(build_id, owner, udid, data.status);
		}
		this.wsOK(notifiers.websocket, data.status, udid);
	}

	processShellError(owner, build_id, udid, data) {
		let dstring = data.toString();
		console.log("[STDERR] " + data);
		if (dstring.indexOf("fatal:") !== -1) {
			blog.state(build_id, owner, udid, "FAILED");
		}
	}

	processShellData(opts, data) {

		if (typeof (data) === "object") return;
		let logline = data;
		if (logline.length > 1) { // skip empty lines in log
			logline = logline.replace("\n\n", "\n"); // strip duplicate newlines in log, ignore lint warnings here

			// Strip only first line for console logging
			console.log("[" + opts.build_id + "] »»", logline.replace("\n", ""));

			// just a hack while shell.exit does not work or fails with another error
			if ((logline.indexOf("STATUS OK") !== -1) || // old
				(logline.indexOf("status: OK") !== -1)) // new
			{
				this.notify(opts.udid, opts.build_id, opts.notifiers, "Completed", true);
				blog.state(opts.build_id, opts.owner, opts.udid, "Success");
				this.wsOK(opts.notifiers.websocket, "Build successful.", opts.udid);

				this.sources.update(opts.owner, opts.source_id, "last_build", opts.version, (result) => {
					console.log("🔨 [debug] updateLastBuild result:", result);
				});
			}
		}

		// Tries to send but socket will be probably closed.
		this.sendNotificationIfSocketAlive(
			opts.notifiers.websocket,
			logline
		);
	}

	runShell(XBUILD_PATH, command, args, owner, build_id, udid, notifiers) {
		const opts = {
			owner: owner,
			build_id: build_id,
			udid: udid,
			notifiers: notifiers
		};
		console.log("[builder] Executing LOCAL build:", [command, ...args].join(" "));
		recordStatsEvent(owner, EventTaxonomy.NAMES.BUILD_STARTED, build_id);
		let shell = exec.spawn(command, args, { cwd: ROOT, shell: false });
		shell.on("error", (error) => {
			console.log("[builder] local build spawn failed:", error);
			recordStatsEvent(owner, EventTaxonomy.NAMES.BUILD_FAILED, build_id);
			this.processExitData(owner, build_id, udid, notifiers, error.message);
			this.cleanupSecrets(XBUILD_PATH);
		});
		shell.stdout.on("data", (data) => {
			this.processShellData(opts, data.toString());
		});
		shell.stderr.on("data", (data) => {
			this.processShellError(owner, build_id, udid, data);
		});
		shell.on("exit", (code) => {
			console.log(`[OID:${owner}] Build completed LOCAL [builder] with code ${code}`);
			// success error code is processed using job-status parser
			if (code === 0) {
				recordStatsEvent(owner, EventTaxonomy.NAMES.BUILD_SUCCESS, build_id);
			} else {
				recordStatsEvent(owner, EventTaxonomy.NAMES.BUILD_FAILED, build_id);
				this.processExitData(owner, build_id, udid, notifiers, code);
			}
			this.cleanupSecrets(XBUILD_PATH);
		});
	}

	containsNullOrUndefined(array) {
		for (let index in array) {
			const item = array[index];
			if (typeof (item) === "undefined") return false;
			if (item === null) return false;
			if (item.length === 0) return false;
		}
		return true;
	}

	// DevSec uses only 2nd part of MAC, because beginning
	// is always same for ESPs and thus easily visible.
	formatMacForDevSec(incoming) {
		let outgoing;
		let no_colons = incoming.replace(/:/g, "");
		if (no_colons.length == 12) {
			outgoing = no_colons.substr(6, 12);
		} else {
			outgoing = no_colons;
		}
		return outgoing;
	}

	// fetch last git tag in repository or return 1.0
	getTag(rpath) {
		let git_tag = null;
		try {
			git_tag = this.runGitCommand(rpath, ["describe", "--abbrev=0", "--tags"]);
		} catch (_e) {
			git_tag = "1.0";
		}
		if (git_tag === null) {
			git_tag = "1.0";
		}
		console.log(`ℹ️ [info] [builder] Tried to fetch GIT tag at ${rpath} with result ${git_tag}`);
		return git_tag;
	}

	runGitCommand(repoPath, gitArgs) {
		return exec.execFileSync("git", gitArgs, {
			cwd: repoPath,
			encoding: "utf8"
		}).trim();
	}

	// Public attempt: the shared argv clone routine without any key (D-05).
	prefetchPublic(buildPath, sanitized_url, sanitized_branch) {
		console.log("[builder] Attempting public git fetch...");
		const result = this.git.cloneRepository(buildPath, sanitized_url, sanitized_branch, this.git.baseEnv());
		if (result.ok) {
			console.log("ℹ️ [info] [build] public prefetch git result OK");
		} else {
			console.log(`[builder] public git fetch failed (${result.reason})`);
		}
		return result.ok;
	}

	// One build-log line naming the repository symlinks that were checked out
	// as plain files (D-13), or null when there are none. Names are capped at
	// 20 and control characters replaced, so a hostile file name cannot add
	// lines of its own to the build log.
	symlinkWarning(names) {
		if (!Array.isArray(names) || (names.length === 0)) return null;
		const LIMIT = 20;
		const shown = names.slice(0, LIMIT).map((name) => String(name).replace(/[\u0000-\u001f\u007f]/g, "?")).join(", ");
		const more = (names.length > LIMIT) ? ` and ${names.length - LIMIT} more` : "";
		return `warning: repository symlinks were checked out as plain files (core.symlinks=false): ${shown}${more}`;
	}

	// Resolves true when BUILD_PATH holds a checkout, false otherwise; never
	// rejects. The caller owns the build-log state on failure, so this stays
	// free of CouchDB calls.
	async prefetchPrivate(br, BUILD_PATH, url, branch) {

		let build_id = br.build_id;
		let owner = br.owner;
		let udid = br.udid;
		let source_id = br.source_id;

		try {
			// this checks whether the previous (public) prefetch did succeed. if yes; skips...
			if (fs.existsSync(path.join(BUILD_PATH, "basename.json"))) return true;

			// fetch using owner keys...
			console.log("[builder] Fetching using SSH keys...");
			const success = await this.git.fetch(owner, url, branch, BUILD_PATH);
			if (success !== true) {
				console.log("☣️ [error] Git prefetchPrivate FAILED for build_id", build_id, "owner", owner, "udid", udid);
				return false;
			}
		} catch (e) {
			console.log("☣️ [error] Git prefetchPrivate threw for build_id", build_id, e.message);
			return false;
		}

		// Update the privacy status in the background. `return xuccess` used to
		// sit inside this callback, so it returned from the CALLBACK and
		// prefetchPrivate() itself fell off the end -- returning undefined on
		// every successful fetch. The caller does
		//   if (!this.prefetchPrivate(...)) return callback(false, "git_fetch_failed");
		// so the build aborted silently the moment the clone finally started
		// working: no builder container was ever started and the build log
		// stayed at "created" with no lines in it. This was masked for as long
		// as the fetch itself failed and took the `return false` path above.
		// The fetch has already succeeded here; that is what the caller needs.
		try {
			this.sources.update(owner, source_id, "is_private", true, (xuccess, error) => {
				if (xuccess) {
					console.log(`ℹ️ [info] repo privacy status updated to is_private=true; should prevent future public fetches`);
				} else {
					console.log(`[critical] updating repo privacy status failed with error ${error}`);
				}
			});
		} catch (e) {
			console.log(`[critical] updating repo privacy status threw ${e.message}`);
		}

		return true;
	}

	generate_thinx_json(api_envs, device, api_key, commit_id, git_tag, XBUILD_PATH) {

		// Load template
		let json = JSON.parse(
			fs.readFileSync(
				__dirname + "/../../builder.thinx.dist.json"
			)
		);

		if (typeof (api_envs) === "undefined" || api_envs === null) {
			console.log("[builder] No env vars to apply...");
			api_envs = [];
		}

		if (api_envs.count > 0) {
			console.log("[builder] Applying environment vars...");
			for (let object in api_envs) {
				let key = Object.keys(object)[0];
				console.log("Setting " + key + " to " + object[key]);
				json[key] = object[key];
			}
		} else {
			console.log("[builder] No environment vars to apply...");
		}

		// Attach/replace with important data
		json.THINX_ALIAS = device.alias;
		json.THINX_API_KEY = api_key; // inferred from last_key_hash

		// Replace important data...
		json.THINX_COMMIT_ID = commit_id.replace("\n", "");
		json.THINX_FIRMWARE_VERSION_SHORT = git_tag.replace("\n", "");

		let REPO_NAME = XBUILD_PATH.replace(/^.*[\\\/]/, '').replace(".git", "");

		json.THINX_FIRMWARE_VERSION = REPO_NAME + ":" + git_tag.replace("\n", "");
		json.THINX_APP_VERSION = json.THINX_FIRMWARE_VERSION;

		json.THINX_OWNER = device.owner;
		json.THINX_PLATFORM = device.platform;
		json.LANGUAGE_NAME = JSON2H.languageNameForPlatform(device.platform);
		json.THINX_UDID = device.udid;

		// Attach/replace with more specific data...");
		json.THINX_CLOUD_URL = app_config.api_url.replace("https://", "").replace("http://", "");
		json.THINX_MQTT_URL = app_config.mqtt.server.replace("mqtt://", ""); // due to problem with slashes in json and some libs on platforms
		json.THINX_AUTO_UPDATE = true; // device.autoUpdate
		json.THINX_MQTT_PORT = app_config.mqtt.port;
		json.THINX_API_PORT = app_config.port;
		json.THINX_ENV_SSID = "";
		json.THINX_ENV_PASS = "";

		if (typeof (app_config.secure_port) !== "undefined") {
			json.THINX_API_PORT_SECURE = app_config.secure_port;
		}

		json.THINX_AUTO_UPDATE = device.auto_update;
		json.THINX_FORCED_UPDATE = false;

		return json;
	}

	// Reads <XBUILD_PATH>/thinx.yml through safepath (D-10). The checkout is
	// repository-controlled, so thinx.yml may be a symlink to /run/secrets, a
	// sibling build or anything else readable -- and the build later writes
	// decrypted Wi-Fi credentials back into this very path. A missing file is
	// fine (not every repo has one); a symlink or an escape is refused.
	// Returns { ok: true, present: false } | { ok: true, present: true, yml }
	//       | { ok: false, reason: "unsafe_repository_file" }.
	loadRepoYaml(XBUILD_PATH) {
		const read = safepath.readFileInside(XBUILD_PATH, "thinx.yml", "utf8");
		if (!read.ok) {
			if (read.reason === "missing") return { ok: true, present: false };
			console.log("[builder] refusing thinx.yml in " + XBUILD_PATH + ": " + read.reason);
			return { ok: false, reason: "unsafe_repository_file" };
		}
		let yml;
		try {
			yml = YAML.parse(read.data);
		} catch (parse_error) {
			// Same leniency as Platform.getPlatformFromPath: an unparseable file
			// counts as absent, the device platform is used instead.
			console.log("[builder] thinx.yml could not be parsed, ignoring it:", parse_error.message);
			return { ok: true, present: false };
		}
		// YAML.parse returns null for an empty file; Object.keys(null) would throw.
		if ((yml === null) || (typeof (yml) !== "object") || Array.isArray(yml)) {
			return { ok: true, present: false };
		}
		return { ok: true, present: true, yml: yml };
	}

	// Writes a repository file through safepath (contained, no symlink, O_NOFOLLOW).
	// Returns true on success; the caller refuses the build on false.
	writeRepoFile(root, relPath, contents) {
		const written = safepath.writeFileInside(root, relPath, contents);
		if (!written.ok) {
			console.log("[builder] refusing to write " + relPath + " in " + root + ": " + written.reason);
		}
		return written.ok;
	}

	// Single exit for a build refused before it starts (D-10). The owner sees the
	// reason (notifier + build-log state + callback), never a hang, and any
	// secrets already written into the checkout are removed.
	refuseBuild(build_id, owner, udid, notifiers, cleanupPath, callback, reason) {
		console.log("☣️ [error] [builder] build refused (" + reason + ") at " + cleanupPath);
		this.notify(udid, build_id, notifiers, reason, false);
		blog.state(build_id, owner, udid, "error");
		this.cleanupSecrets(cleanupPath);
		callback(false, reason);
	}

	createBuildPath(BUILD_PATH) {
		let mkresult = mkdirp.sync(BUILD_PATH);
		if (!mkresult) {
			console.log("[ERROR] mkdirp.sync ended with with:", mkresult);
			return;
		}
		// Synchronous: BUILD_PATH is new and empty here, and an async walk
		// would overlap the clone that fills it next (git.js cloneRepository
		// empties and repopulates this directory). Still best effort, as before.
		try {
			chmodr.sync(BUILD_PATH, 0o766);
			console.log("[builder] BUILD_PATH permission change successful.");
		} catch (cherr) {
			console.log('Failed to execute chmodr', cherr);
		}
	}

	run_build(br, notifiers, callback, transmit_key) {

		let start_timestamp = new Date().getTime();

		console.log("[builder] Build preparation started at", start_timestamp);

		let build_id = br.build_id;
		let owner = br.owner;
		let git = br.git;
		let branch = br.branch;
		let udid = br.udid;
		let source_id = br.source_id;

		if ((typeof (br.worker) === "undefined") || (typeof (br.worker.socket) === "undefined")) {
			recordStatsEvent(br.owner, EventTaxonomy.NAMES.BUILD_FAILED, br.build_id);
			if (process.env.ENVIRONMENT !== "test") {
				return callback(false, "workers_not_ready");
			}
		}

		if (!this.buildGuards(callback, owner, git, branch)) {
			recordStatsEvent(owner, EventTaxonomy.NAMES.BUILD_FAILED, build_id);
		}

		blog.log(build_id, owner, udid, "started"); // may take time to save, initial record to be edited using blog.state

		// D-12: build_id becomes the last BUILD_PATH segment; UUID-shaped only.
		// Checked first so a non-string build_id cannot throw on .length.
		if (Sanitka.udid(build_id) === null) return callback(false, "invalid_build_id");
		if ((build_id.length > 64)) return callback(false, "invalid_build_id");

		// Fetch device info to validate owner and udid
		console.log("[builder] Fetching device " + udid + " for owner " + owner);

		devicelib.get(udid, (err, device) => {

			if (err) return callback(false, "no_such_udid");

			// D-12: device.owner/device.udid come from the device record and build a
			// filesystem path. Refuse (never strip) a malformed value before any mkdirp.
			const BUILD_PATH = this.buildPathFor(device.owner, device.udid, build_id);
			if (BUILD_PATH === null) {
				console.log("☣️ [error] [builder] refusing build: invalid device owner/udid for BUILD_PATH");
				blog.state(build_id, owner, udid, "error");
				return callback(false, "invalid_device");
			}

			// Embed Authentication
			this.getLastAPIKey(owner, async (success, api_key) => {

				if (!success || (api_key === null)) {
					console.log("Build requires API Key.");
					blog.state(build_id, owner, udid, "error");
					return callback(false, "build_requires_api_key");
				}

				this.createBuildPath(BUILD_PATH);

				this.notify(udid, build_id, notifiers, "Pulling repository", true);

				// Error may be emutted if document does not exist here.
				// blog.state(build_id, owner, udid, "started"); // initial state from "created", seems to work...

				console.log("[builder] Build path created:", BUILD_PATH);

				//
				// Fetch GIT repository
				//

				if (!Util.isDefined(branch)) branch = "origin/main";
				let sanitized_branch = sanitka.branch(branch);
				if (branch === null) sanitized_branch = "main";
				let sanitized_url = sanitka.url(git);
				if ((sanitized_branch === null) || (sanitized_url === null)) {
					console.log("[builder] Invalid git URL or branch after sanitization.");
					blog.state(build_id, owner, udid, "error");
					return callback(false, "invalid_git_or_branch");
				}

				// Attempts to fetch GIT repo, if not marked as private
				if (!br.is_private) this.prefetchPublic(BUILD_PATH, sanitized_url, sanitized_branch);

				// Attempts to fetch git repo as private using SSH keys, otherwise fails
				if (!(await this.prefetchPrivate(br, BUILD_PATH, sanitized_url, sanitized_branch))) {
					blog.state(build_id, owner, udid, "error");
					return callback(false, "git_fetch_failed");
				}

				//
				// Cound files
				//

				let files = fs.readdirSync(BUILD_PATH);
				// Dirent.isDirectory() is false for a symlink, so a linked "project
				// directory" is never picked as XBUILD_PATH (D-11).
				let directories = this.getDirectories(BUILD_PATH);

				if ((files.length == 0) && (directories.length == 0)) {
					blog.state(build_id, owner, udid, "error");
					return callback(false, "git_fetch_failed_private");
				}

				// Adjust XBUILD_PATH (build path incl. inferred project folder, should be one.)
				let XBUILD_PATH = BUILD_PATH;

				if (directories.length > 1) {
					XBUILD_PATH = BUILD_PATH + "/" + directories[1]; // 1 is always git
					console.log("[builder] ERROR, TOO MANY DIRECTORIES!");
				}

				if (directories.length === 1) XBUILD_PATH = BUILD_PATH + "/" + directories[0];

				// D-11: the checkout directory must be a real directory inside BUILD_PATH.
				if ((XBUILD_PATH !== BUILD_PATH) && !safepath.resolveInside(BUILD_PATH, path.basename(XBUILD_PATH)).ok) {
					return this.refuseBuild(build_id, owner, udid, notifiers, BUILD_PATH, callback, "unsafe_repository_file");
				}

				console.log("[builder] XBUILD_PATH: " + XBUILD_PATH);

				// D-13: symlinks arrive as plain files (core.symlinks=false). Tell the
				// owner which ones, so a build that relied on links is explainable.
				// A warning, not a failure: the build continues.
				const symlink_warning = this.symlinkWarning(this.git.symlinkEntries(XBUILD_PATH));
				if (symlink_warning !== null) {
					console.log("[builder] " + symlink_warning);
					blog.log(build_id, owner, udid, symlink_warning);
				}

				// static, async inside
				Platform.getPlatform(XBUILD_PATH, (get_success, platform) => {

					// D-11: a symlinked or escaping thinx.yml found by getPlatform.
					if (platform === Platform.UNSAFE_REPOSITORY_FILE) {
						return this.refuseBuild(build_id, owner, udid, notifiers, XBUILD_PATH, callback, "unsafe_repository_file");
					}

					if (!get_success) {
						console.log("[builder] failed on unknown platform" + platform);
						this.notify(udid, build_id, notifiers, "error_platform_unknown", false);
						blog.state(build_id, owner, udid, "error");
						callback(false, "unknown platform: " + platform);
						return;
					}

					// feature/fix ->
					//
					// Verify firmware vs. device MCU compatibility (based on thinx.yml compiler definitions)
					//

					platform = device.platform;

					let platform_array = platform.split(":");
					let device_platform = platform_array[0]; // should work even without delimiter
					let device_mcu = platform_array[1];

					// D-10: contained, no-follow read BEFORE anything else touches thinx.yml.
					// A symlinked or escaping thinx.yml fails the build here, before the
					// read and before the credential write-back below.
					const yml_result = this.loadRepoYaml(XBUILD_PATH);
					if (!yml_result.ok) {
						return this.refuseBuild(build_id, owner, udid, notifiers, XBUILD_PATH, callback, "unsafe_repository_file");
					}
					const isYAML = yml_result.present;

					let y_platform = device_platform;

					if (isYAML) {

						const yml = yml_result.yml;

						if (typeof (yml) !== "undefined") {
							// This takes first key. It could be possible to have more keys (array allows same names)
							// and find the one with closest platform.
							y_platform = Object.keys(yml)[0];
							console.log("[builder] YAML-based platform: " + y_platform);
							const y_section = yml[y_platform];
							const y_mcu = ((typeof (y_section) === "object") && (y_section !== null)) ? y_section.arch : undefined;
							if ((typeof (y_mcu) !== "undefined") && (typeof (device_mcu) !== "undefined")) {
								if (y_mcu.indexOf(device_mcu) == -1) {
									const message = "[builder] MCU defined by thinx.yml (" + y_mcu + ") not compatible with this device MCU: " + device_mcu;
									console.log(message);
									this.notify(udid, build_id, notifiers, message, false);
									blog.state(build_id, owner, udid, "error");
									callback(false, message);
									return;
								} else {
									console.log("[builder] MCU is compatible.");
								}
							}

							// Decrypt cpass and cssid using transmit_key and overwrite in YML file
							// FROM NOW ON, ALL OPERATIONS MUST CLEAR REPO ON EXIT!
							// LIKE: this.cleanupSecrets(BUILD_PATH);
							if (typeof (transmit_key) !== "undefined" && transmit_key !== null) {
								// if there is no devsec defined, uses shared ckey...
								if ((typeof (yml.devsec) == "undefined") || (yml.devsec == null)) {
									console.log("DevSec not defined, using transmit_key as CKEY! in", { yml });
									yml.devsec = {
										ckey: transmit_key
									};
								}
								if (typeof (device.environment) !== "undefined") {
									if (typeof (device.environment.cssid) !== "undefined") {
										let d_cssid = this.decrypt(transmit_key, device.environment.cssid);
										try {
											yml.devsec.ssid = d_cssid;
										} catch (e) {
											console.log(e, "fixing...");
											yml.devsec = {};
										} finally {
											yml.devsec.ssid = d_cssid;
										}
									}
									if (typeof (device.environment.cpass) !== "undefined") {
										let d_cpass = this.decrypt(transmit_key, device.environment.cpass);
										yml.devsec.pass = d_cpass;
									}
								}
								let insecure = YAML.stringify(yml); // A bit insecure but reasonably cheap... SSID/PASS may leak in build, which WILL be fixed later (build deletion, specific secret cleanup)
								// D-10: the decrypted SSID/password go only into the contained,
								// non-symlink XBUILD_PATH/thinx.yml. A refusal aborts the build.
								if (!this.writeRepoFile(XBUILD_PATH, "thinx.yml", insecure)) {
									return this.refuseBuild(build_id, owner, udid, notifiers, XBUILD_PATH, callback, "unsafe_repository_file");
								}
							} else {
								console.log("[warning] no transmit_key; environment variables in build will not be secured until build!");
							}
						}
					} else {
						console.log("[builder] BuildCommand-Detected platform (no YAML at " + XBUILD_PATH + "/thinx.yml): " + platform);
					} // isYAML

					// <- platform_descriptor needs header (maybe only, that's OK)

					/* Export device specific env-vars to environment.json, should decrypt later as well */
					let device_specific_environment = device.environment;
					if (typeof (device_specific_environment) !== "undefined") {
						let envString = JSON.stringify(device_specific_environment);
						console.log("Saving device-specific envs to", XBUILD_PATH + "/environment.json");
						// environment.json carries device env values: contained and never
						// through a repository symlink (D-11).
						if (!this.writeRepoFile(XBUILD_PATH, "environment.json", envString)) {
							return this.refuseBuild(build_id, owner, udid, notifiers, XBUILD_PATH, callback, "unsafe_repository_file");
						}
					}

					// SEC: y_platform originates in the build repository's own thinx.yml
					// (Object.keys(yml)[0] above), so it is attacker-controlled. Accept it
					// only when it is an exact match of a directory under platforms/.
					const platforms_root = path.resolve(__dirname, "..", "..", "platforms");
					let platform_directory = JSON2H.validatedPlatformDirectory(platforms_root, y_platform);
					let d_filename = (platform_directory === null) ? null : path.join(platform_directory, "descriptor.json");

					if ((d_filename === null) || !fs.existsSync(d_filename)) {
						let d_reported = (d_filename === null) ? (platforms_root + "/<invalid platform>/descriptor.json") : d_filename;
						console.log("[builder] no descriptor found in file " + d_reported);
						blog.state(build_id, owner, udid, "error");
						this.cleanupSecrets(XBUILD_PATH);
						callback(false, "builder not found for platform in: " + d_reported);
						return;
					}

					// JSON.parse instead of require(variable): the descriptor is data, not code.
					// A malformed descriptor must not throw out of run_build (nothing catches it),
					// it takes the same path as a missing one.
					let platform_descriptor;
					try {
						platform_descriptor = JSON.parse(fs.readFileSync(d_filename, "utf8"));
					} catch (descriptor_error) {
						console.log("[builder] unreadable descriptor in file " + d_filename, descriptor_error.message);
						blog.state(build_id, owner, udid, "error");
						this.cleanupSecrets(XBUILD_PATH);
						callback(false, "builder not found for platform in: " + d_filename);
						return;
					}
					let commit_id = this.runGitCommand(XBUILD_PATH, ["rev-list", "--all", "--max-count=1"]);
					let git_revision = this.runGitCommand(XBUILD_PATH, ["rev-list", "--all", "--count"]);
					let git_tag = this.getTag(XBUILD_PATH);

					let REPO_VERSION = (git_tag + "." + git_revision).replace(/\n/g, "");
					let HEADER_FILE_NAME = platform_descriptor.header;

					console.log("[builder] REPO_VERSION (TAG+REV) [unused var]: '" + REPO_VERSION.replace(/\n/g, "") + "'");



					//
					// Fetch API Envs and create header file
					//

					this.apienv.list(owner, (env_list_success, api_envs) => {

						if (!env_list_success) {
							console.log("[builder] [APIEnv] Listing failed:" + owner);
							// must not be blocking
						}

						let thinx_json = this.generate_thinx_json(api_envs, device, api_key, commit_id, git_tag, XBUILD_PATH);

						console.log("[builder] Writing template to thinx_build.json...");

						// Contained write; a refusal now calls back (this path used to
						// return without a callback and left the build request hanging).
						if (!this.writeRepoFile(XBUILD_PATH, "thinx_build.json", JSON.stringify(thinx_json))) {
							return this.refuseBuild(build_id, owner, udid, notifiers, XBUILD_PATH, callback, "unsafe_repository_file");
						}

						let header_file = null;
						try {
							console.log("Finding", HEADER_FILE_NAME, "in", XBUILD_PATH);
							let h_file = findFilesSync(XBUILD_PATH, HEADER_FILE_NAME, true);
							if ((typeof (h_file) !== "undefined") && h_file !== null) {
								header_file = h_file[0];
							}
							console.log("[builder] found header_file: " + header_file);
						} catch (e) {
							console.log("Exception while getting header, use FINDER!: " + e);
							blog.state(build_id, owner, udid, "error");
						}

						if ((header_file === null) || (typeof (header_file) === "undefined")) {
							header_file = path.join(XBUILD_PATH, String(HEADER_FILE_NAME));
							console.log("header_file empty, assigning path:", header_file);
						}

						console.log("[builder] Final header_file:", header_file);

						if ((platform != "mongoose") || (platform != "python") || (platform != "nodejs")) {
							console.log("[builder] Generating C-headers from into", header_file);
							// Same content JSON2H.convert produced, written synchronously,
							// contained and never through a symlink (D-11).
							const header_rel = path.relative(XBUILD_PATH, header_file);
							const header_check = safepath.resolveInside(XBUILD_PATH, header_rel);
							if (header_check.reason === "missing") {
								console.log("[user-err] Should be reported: No header_file to write at", header_file, "for platform", platform);
							} else if (!header_check.ok) {
								return this.refuseBuild(build_id, owner, udid, notifiers, XBUILD_PATH, callback, "unsafe_repository_file");
							} else if (!this.writeRepoFile(XBUILD_PATH, header_rel, JSON2H.process(thinx_json, {}))) {
								return this.refuseBuild(build_id, owner, udid, notifiers, XBUILD_PATH, callback, "unsafe_repository_file");
							}
						}

						callback(true, {
							response: "build_started",
							build_id: build_id
						}); // last callback before executing

						//
						// start the build in background (device, br, udid, build_id, owner, ROOT, fcid, git, sanitized_branch, XBUILD_PATH, api_envs...)
						//

						let fcid = "000000";
						if (typeof (device.fcid) !== "undefined") {
							fcid = device.fcid;
						}

						let dry_run = (br.dryrun === true) ? " --dry-run" : "";

						if (udid === null) {
							console.log("[builder] Cannot build without udid!");
							this.notify(udid, build_id, notifiers, "error_starting_build", false);
							blog.state(build_id, owner, udid, "error");
							return;
						}

						const buildArgs = [
							"--owner=" + owner,
							"--udid=" + udid,
							"--fcid=" + fcid,
							"--mac=" + this.formatMacForDevSec(device.mac),
							"--git=" + git,
							"--branch=" + sanitized_branch,
							"--id=" + build_id,
							"--workdir=" + XBUILD_PATH
						];
						if (dry_run.length > 0) {
							buildArgs.push(dry_run.trim());
						}

						if (!env_list_success) {
							console.log("[builder] Custom ENV Vars not loaded.");
						} else {
							let stringVars = JSON.stringify(api_envs);
							console.log("[builder] Build with Custom ENV Vars: " + stringVars);
							buildArgs.push("--env=" + stringVars);
						}
						console.log("[builder] Building with arguments: " + buildArgs.join(" "));
						this.notify(udid, build_id, notifiers, "Building...", true);

						let end_timestamp = new Date().getTime() - start_timestamp;
						let seconds = Math.ceil(end_timestamp / 1000);
						console.log("Build Preparation stage took: ", seconds, "seconds");

						if (br.worker === false) {
							console.log("[builder] Executing LOCAL build...");
							this.runShell(
								XBUILD_PATH,
								path.join(ROOT, "builder"),
								buildArgs,
								owner,
								build_id,
								udid,
								notifiers
							);
						} else {
							console.log("[builder] Requesting REMOTE build...");
							this.runRemoteShell(br.worker, buildArgs, owner, build_id, udid, notifiers, source_id);
						}
					}); // apienv.list
				}); // Platform.getPlatform(XBUILD_PATH)
			}); // this.getLastAPIKey
		}); // devicelib.get
	}

	// public

	cleanupSecrets(cpath) {

		// critical files must be deleted after each build to prevent data leak;
		// must happen even on errors

		// unlinkInside never follows a symlink (it removes the link itself),
		// stays inside cpath and never throws, so cleanup cannot delete a file
		// outside the build and never aborts half-way (D-11 exception).
		let env_files = findFilesSync(cpath, "environment.json", false);
		env_files.forEach(env_file => {
			console.log("Cleaning up secrets:", env_file);
			safepath.unlinkInside(cpath, env_file);
		});

		let h_files = findFilesSync(cpath, "environment.h", false);
		h_files.forEach(h_file => {
			console.log("Cleaning up headers:", h_file);
			safepath.unlinkInside(cpath, h_file);
		});

		let yml_files = findFilesSync(cpath, "thinx.yml", false);
		yml_files.forEach(yml_file => {
			console.log("Cleaning up build-configurations:", yml_file);
			safepath.unlinkInside(cpath, yml_file);
		});
	}

	build(owner, build, notifiers, callback, worker) {

		let build_id = uuidV1();
		let udid;

		if (typeof (callback) === "undefined") {
			callback = () => {
				// nop
				console.log("This is replacement for undefined callback, that does nothing.");
			};
		}

		let dryrun = false;
		if (typeof (build.dryrun) !== "undefined") {
			dryrun = build.dryrun;
		}

		if (typeof (build.udid) !== "undefined") {
			if (build.udid === null) {
				callback(false, {
					success: false,
					response: "missing_device_udid",
					build_id: build_id
				});
				return;
			}
			udid = sanitka.udid(build.udid);
		} else {
			console.log("NOT Assigning empty build.udid! " + build.udid);
		}

		if (typeof (build.source_id) === "undefined") {
			callback(false, {
				success: false,
				response: "missing_source_id",
				build_id: build_id
			});
			return;
		}

		if (typeof (owner) === "undefined") {
			callback(false, {
				success: false,
				response: "missing_owner",
				build_id: build_id
			});
			return;
		}

		devicelib.view("devices", "devices_by_owner", {
			"key": owner.replace("\"", ""),
			"include_docs": true
		}, (err, body) => {

			if (err) {
				if (err.toString() == "Error: missing") {
					callback(false, {
						success: false,
						response: "no_devices",
						build_id: build_id
					});
				}
				console.log("[builder] /api/build: Error: " + err.toString());

				if (err.toString().indexOf("No DB shards could be opened") !== -1) {
					let that = this;
					console.log("Will retry in 5s...");
					setTimeout(() => {
						that.list(owner, callback);
					}, 5000);
				}

				return;
			}

			let rows = body.rows; // devices returned
			let device;

			for (let row in rows) {

				let hasDocProperty = Object.prototype.hasOwnProperty.call(rows[row], "doc");
				if (!hasDocProperty) continue;
				device = rows[row].doc;

				let hasUDIDProperty = Object.prototype.hasOwnProperty.call(device, "udid");
				if (!hasUDIDProperty) continue;
				let db_udid = device.udid;

				let device_owner = "";
				if (typeof (device.owner) !== "undefined") {
					device_owner = device.owner;
				} else {
					device_owner = owner;
				}

				if (device_owner.indexOf(owner) !== -1) {
					if (udid.indexOf(db_udid) != -1) {
						udid = device.udid; // target device ID
						break;
					}
				}
			}

			if ((typeof (device) === "undefined") || udid === null) {
				console.log(`☣️ [error] No device is currently using source ${build.source_id}.`);
				callback(false, {
					success: false,
					response: "device_not_found",
					build_id: build_id
				});
				return;
			}

			// 1. Converts build.git to git url by seeking in users' repos
			// 2. uses owner's transmit_key to decrypt customer's cssid and cpass
			userlib.get(owner, (user_get_err, doc) => {

				if (user_get_err) {
					console.log(`☣️ [error] [builder] ${user_get_err}.`);
					callback(false, {
						success: false,
						response: "device_fetch_error",
						build_id: build_id
					});
					return;
				}

				if ((typeof (doc) === "undefined") || doc === null) {
					callback(false, {
						success: false,
						response: "no_such_owner",
						build_id: build_id
					});
					return;
				}

				// 2. Transmit key should be used when encrypting device environment values...

				let transmit_key = null;

				// Allow using global custom transmit_key for on-premise installs
				if (typeof (app_config.transmit_key) !== "undefined") {
					console.log("Loading global transmit key...");
					transmit_key = app_config.transmit_key;
				}

				// Prefer custom transmit_key
				if (typeof (owner.transmit_key) !== "undefined") {
					console.log("Using owner transmit key.");
					transmit_key = owner.transmit_key;
				}

				// 1.

				let git = null;
				let branch = "origin/master";
				let source = {};

				// Finds first source with given source_id
				let all_sources = Object.keys(doc.repos);
				for (let index in all_sources) {
					let sid = all_sources[index];
					if (typeof (sid) === "undefined") {
						console.log("[builder] source_id at index " + index + "is undefined, skipping...");
						continue;
					}
					if (sid.indexOf(build.source_id) !== -1) {
						source = doc.repos[all_sources[index]];
						git = source.url;
						branch = source.branch;
						break;
					}
				}

				if (!this.containsNullOrUndefined([udid, build, owner, git])) {
					callback(false, {
						success: false,
						response: "invalid_params",
						build_id: build_id
					});
					return;
				}

				// Saves latest build_id to device and if success, runs the build...
				devicelib.atomic("devices", "modify", device.udid, { build_id: build_id }, (mod_error) => {
					if (mod_error) {
						console.log(`☣️ [error] [builder] Atomic update failed: ${mod_error}.`);
						return callback(false, {
							success: false,
							response: "DEVICE MOD FAILED",
							build_id: build_id
						});
					} else {

						let buildRequest = {
							build_id: build_id,
							source_id: build.source_id,
							owner: owner,
							git: git,
							branch: branch,
							udid: udid,
							dryrun: dryrun,
							worker: worker,
							is_private: source.is_private
						};

						this.run_build(buildRequest, notifiers, callback, transmit_key);
					}
				});
			});
		});
	}

	supportedLanguages() {
		let languages_path = __dirname + "/../../languages";
		return fs.readdirSync(languages_path).filter(
			file => fs.lstatSync(path.join(languages_path, file)).isDirectory()
		);
	}

	// duplicate functionality to plugins... should be merged
	supportedExtensions() {
		let languages_path = __dirname + "/../../languages";
		let languages = this.supportedLanguages();
		let extensions = [];
		for (let lindex in languages) {
			let dpath = path.join(languages_path, languages[lindex], "descriptor.json");
			// JSON.parse instead of require(variable): descriptors are data, not code.
			let descriptor;
			try {
				descriptor = JSON.parse(fs.readFileSync(dpath, "utf8"));
			} catch (_e) {
				descriptor = undefined;
			}
			if (typeof (descriptor) !== "undefined") {
				let xts = descriptor.extensions;
				for (let eindex in xts) {
					extensions.push(xts[eindex]);
				}
			} else {
				console.log("No Language descriptor found at " + dpath);
			}
		}
		return extensions;
	}
};
