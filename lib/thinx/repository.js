/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require("fs-extra");
var exec = require("child_process");
var githooked = require("githooked");
var finder = require("fs-finder");
var YAML = require('yaml');

var RSAKey = require("./rsakey");
var rsakey = new RSAKey();

var nochange = "Already up-to-date.";

module.exports = class Repository {

	constructor() {
		this.gh = null;
		this.exit_callback = (status) => {
			console.log("Empty this.exit_callback with status "+status);
		};
	}

	findAllRepositories() {
		var repositories_path = app_config.data_root + app_config.build_root + "/";
		console.log("Searching repos in: " + repositories_path);
		var repo_gits = finder.from(repositories_path).showSystemFiles().findDirectories(".git");
		return repo_gits;
	}

	findAllRepositoriesWithFullname(full_name) {
		var repo_gits = this.findAllRepositories();
		var repositories = [];
		for (var dindex in repo_gits) {
			const repo = repo_gits[dindex];
			if (repo.indexOf(full_name) == -1) continue;
			if (repo.indexOf("/.git") == repo.length-5) {
				repositories.push(repo.replace("/.git", ""));
			}
		}
		return repositories;
	}

	process_hook(info) {

		var repository = info.repository;
		var name = repository.name;
		var full_name = repository.full_name;

		if (full_name.indexOf("suculent/thinx-device-api") !== -1) {
			console.log("[repository.js:watch] » Skipping webhook own self.");
			return;
		}

		console.log("[repository.js:watch] » GitHub Webhook called for Git repository: " + full_name);
		var repositories = this.findAllRepositoriesWithFullname(full_name);
		if (repositories.length == 0) {
			console.log("No repositories found with filter "+full_name);
			return;
		}

		console.log("\n[repository.js:watch] found repos: " + JSON.stringify(repositories));
		if (typeof(this.exit_callback) === "undefined") {
			this.exit_callback = () => {
				console.log("Exit callback was undefined, this is a placeholder. We don't probably need it here.");
			};
		} else {
			console.log("Some exit callback function has been defined...");
		}

		console.log("[repository.js:watch] Found " + repositories.length + " repositories with name: " + name);
		for (var rindex in repositories) {
			console.log("Checking repository changes in " + repositories[rindex]);
			this._checkRepositoryChange(repositories[rindex], false, this.exit_callback);
		}
	}

	init_githooked(gh) {

		try {
			gh.listen(app_config.webhook_port, "0.0.0.0"); // this is USER GIT webhook!
			console.log("Webhook(s) sucessfuly initialized.");
		} catch (e) {
			// may fail if thihs instance is not a master
			console.log(e);
		}

		githooked().on('push', (info) => {
			console.log('githooked ref ' + info.ref + ' was pushed.');
			console.log(JSON.stringify(info));
		});

		githooked().on('delete', (info) => {
			console.log('githooked ref ' + info.ref + ' was deleted.');
			console.log(JSON.stringify(info));
		});

		githooked().on('error', (msg) => {
			console.log("githooked error: " + msg);
		});
	}

	// TODO: Extract to prevent duplication
	stripDangerousCharacters(s) {
		s.replace(/'/g, "");
		s.replace(/{/g, "");
		s.replace(/}/g, "");
		s.replace(/\\/g, "");
		s.replace(/\"/g, "");
		s.replace(/;/g, "");
		s.replace(/&/g, "");
		return s;
	}

	endsWith(x, y) {
		return x.lastIndexOf(y) === x.length - y.length;
	}

	filterGitDirs(all_dirs, owner) {
		var git_dirs = [];
		// filter only git dirs for owner
		for (var dindex in all_dirs) {
			var adir = all_dirs[dindex];
			if (adir.indexOf(owner) !== -1) {
				if (adir.endsWith(".git")) {
					git_dirs.push(adir);
					console.log("Selecting "+adir);
				}
			}
		}
		return git_dirs;
	}

	checkCallbackWithParams(check_callback, params) {
		if (typeof(check_callback) === "function") {
			check_callback(params);
		}
	}

	getPlatformFromPath(local_path) {

		const yml_path = local_path + "/thinx.yml";
		const isYAML = fs.existsSync(yml_path);

		if (!isYAML) {
			console.log("No YAML " + yml_path + ")");
			return null;
		}

		const y_file = fs.readFileSync(yml_path, 'utf8');
		const yml = YAML.parse(y_file);
		var platform = null;

		if (typeof(yml) !== "undefined") {
			console.log("[repository] Parsed YAML: "+JSON.stringify(yml));
			platform = Object.keys(yml)[0];
			console.log("[repository] YAML-based platform: " + platform);

			// Store platform + architecture if possible
			if ( (typeof(yml.arduino) !== "undefined") &&
					 (typeof(yml.arduino.arch) !== "undefined") ) {
						 platform = platform + ":" + yml.arduino.arch;
			}
		}

		return platform;
	}

	extractOwnerFromLocalPath(local_path) {
		const owner_tail = local_path.replace(app_config.data_root + "/", ""); // strip start
		const owner_arr = owner_tail.split("/");
		return owner_arr[0];
	}

	tryGitFetchWithKeys(owner_id, key_paths, CMD) {
		var result;
		for (var kindex in key_paths) {
			const kname = key_paths[kindex];
			if (kname.indexOf(owner_id) === -1) {
				continue;
			}
			//var prefix = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
			var prefix = "cp " + app_config.ssh_keys + "/" + key_paths[kindex] + " ~/.ssh/id_rsa; "; // needs cleanup after build to prevent stealing code!
				 prefix += "cp " + app_config.ssh_keys + "/" + key_paths[kindex] + ".pub ~/.ssh/id_rsa.pub; bash -c '";
			try {
				console.log("GIT_FETCH: " + CMD);
				result = exec.execSync(CMD).toString().replace("\n", "");
				console.log("[builder] git rsa clone result: " + result);
				break;
			} catch (e) {
				console.log("git rsa clone error (cleaning up...): "+e);
				const RSA_CLEAN = "rm -rf ~/.ssh/id_rsa && rm -rf ~/.ssh/id_rsa.pub";
				exec.execSync(RSA_CLEAN);
			}
			if (result.indexOf(nochange) !== -1) {
				break;
			}
		}
		return result;
	}

	_watcherTimeoutFunction(local_path, repeat, callback) {
		return () => {
			this._checkRepositoryChange(local_path, false, callback);
		};
	}

	checkRepositoryChangeInitialValidation(local_path, repeat, check_callback) {
		console.log("[repository:checkRepositoryChange] Checking change by git pull at(1): " + local_path);

		const owner_id = this.extractOwnerFromLocalPath(local_path);
		local_path.replace("./", app_config.data_root); // temporal coupling to local path!

		console.log("[repository:checkRepositoryChange] Checking change by git pull at(2): " + local_path);

		if (typeof(local_path) === "undefined" || (local_path == null)) {
			console.log("[checkRepositoryChange] local path undefined!");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		if (local_path === []) {
			console.log("[checkRepositoryChange] local path is empty array!");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		if (!fs.existsSync(local_path)) {
			console.log("Repository local path " + local_path + " not found.");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		var all_dirs = finder.from(local_path).showSystemFiles().findDirectories("\/.git");
		var git_dirs = this.filterGitDirs(all_dirs, owner_id);

		// In case there is not even one git dir on local path,
		// this is not a directory and rest should be skipped.
		console.log("[checkRepositoryChange]: git_dirs found: " + JSON.stringify(git_dirs));

		// now the gitdir should be really valid
		if (!fs.lstatSync(local_path).isDirectory() ||
				(git_dirs.length === 0)) {
			console.log("checkRepositoryChange: This is not a git repo: " +
				__dirname + "(localpath: " + local_path + "/.git )");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		var sanitized_path = this.stripDangerousCharacters(local_path);

		if (local_path.indexOf("undefined") !== -1) {
			console.log("[REPOSITORY].js:312: Incorrect local_path " + local_path);
			return false;
		}

		const git_path = (local_path + "/.git").replace("//", "/");
		if (!fs.existsSync(git_path)) {
			console.log("No .git folder found in git_path "+git_path);
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		return sanitized_path;
	}

	_checkRepositoryChange(local_path, repeat, check_callback) {

		let sanitized_path = this.checkRepositoryChangeInitialValidation(local_path, repeat, check_callback);
		if (sanitized_path === false) {
			// can safely exit, check_callback must be called in checkRepositoryChangeInitialValidation
			return;
		}

		const CMD = "bash -c 'cd " + sanitized_path + "; git status; ls; git reset --hard; git pull --recurse-submodules'";
		console.log("[checkRepositoryChange] CMD: "+ CMD);

		let temp;

		try {
			temp = exec.execSync(CMD).toString().replace("\n", "");
		} catch (e) {
			console.log("checkRepositoryChange error: ");
			console.log(JSON.stringify(e.message));
			// return; // do not return; may fail on private repos normally...
		}

		// try to solve access rights issue by using owner keys...
		var git_success = fs.existsSync(local_path + "/*");
		if ( git_success == false || git_success == [] ) {
			console.log("Initial prefetch failed, will re-try using SSH keys...");
			// only private owner keys
			var owner_id = local_path.split("/")[1];
			const key_paths = rsakey.getKeyPathsForOwner(owner_id);
			console.log({ key_paths });
			if (key_paths.count < 1) {
				check_callback(false, "no_rsa_key_found");
				return;
			}
			// would use cleanupDirectory() from sources, also this sources.js and respository.js is a bit of cross-functional mess...
			// sources should manage DB, repository.js shoud perform git ops... to deduplicate the code.
			temp = this.tryGitFetchWithKeys(owner_id, key_paths, CMD);
		} else {
			console.log("GIT Fetch Result: " + temp);
		}


		//
		// Scheduling (deprecated)
		//

		if (this.timer !== null) {
			clearTimeout(this.timer);
		}
		if (temp.indexOf(nochange) !== -1 && repeat) {
			// watcher needs to be set before calling check
			console.log("Watcher: " + JSON.stringify(this.watcher));
			if (typeof(this.watcher) !== "undefined" || this.watcher !== null) {
				console.log("[REPOSITORY].js:299: Setting watcher timer for " + local_path);
				this.timer = setTimeout(this._watcherTimeoutFunction(
					local_path,
					repeat,
					check_callback), 30000);
			}
			return false;
		}

		/*
		// LOGGING >
		if (repeat) {
			console.log("[REPOSITORY] git-watch: " + local_path + " : repository updated with timer");
		}
		console.log("[REPOSITORY] Current revision number: " + this.getRevisionNumber(local_path));
		console.log("[REPOSITORY] Current revision: " + this.getRevision(local_path));
		// LOGGING <
		*/

		this.checkCallbackWithParams(check_callback, {
			local_path: local_path,
			version: this.version,
			revision: this.revision,
			changed: true
		});
		return true;
	}

	watch() {

		console.log("[repository.js:watch] init...");

		if (!(require('cluster').isMaster)) {
			console.log("[repository.js:watch] » Skipping Git Webhook on slave instance (not needed): " + process.env.NODE_APP_INSTANCE);
			return;
		} else {
			console.log("[repository.js:watch] is master process...");
		}

		// will deprecate
		if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
			return; // not supported on circle, why?
		}

		console.log("[repository.js:watch] » Starting User Webhook Listener on port 9001, instance: " + process.env.NODE_APP_INSTANCE);
		if (this.gh == null) {
			console.log("[repository.js:watch] starting githook...");
			this.gh = githooked("push", this.process_hook);
			this.init_githooked(this.gh);
		}

	}

	watchRepository(local_path, callback) {

		if (local_path === null) {
			if (typeof(callback) === "function") {
				callback(false, "invalid_local_path");
			} else {
				console.log("[watchRepository]: invalid local path, no callback");
			}
		}

		if ((typeof(callback) === "function")) {
			this.exit_callback = callback;
		} else {
			this.exit_callback = (success) => {
				return success;
			};
		}

		console.log("Watching repository: " + local_path);

		this.watcher = {
			repository: local_path,
			callback: callback,
			run: true
		};

		if (typeof(callback) === "undefined") {
			console.log(
				"[REPOSITORY] Warning, no watch callback given, watching anyway...");
				this._checkRepositoryChange(local_path, true, (status, response) => {
				callback(status, response);
			});
		} else {
			console.log("Starting callback repository watcher on " + local_path);
			this._checkRepositoryChange(local_path, true, this.exit_callback);
		}
	}

	unwatchRepository() {

		if (this.watcher) {
			console.log("[REPOSITORY] Stopping watcher for " + this.watcher.repository);
			if (typeof(this.exit_callback) !== "undefined") {
				this.exit_callback();
			} else {
				console.log("[REPOSITORY] WARNING! Watcher has no callback.");
			}
		} else {
			console.log("[REPOSITORY] unwatchRepository: no watcher... exiting.");
			if (typeof(this.exit_callback) !== "undefined") {
				this.exit_callback(false);
			}
		}
	}

	/*
	 * Perform a pull on repository to find out if there are new commits.
	 */

	checkRepositoryChange(local_path, repeat, check_callback) {
		return this._checkRepositoryChange(local_path, repeat, check_callback);
	}

	getRevisionNumber(local_path) {
		var CMD = "cd " + app_config.project_root + "&& git rev-list HEAD --count";
		if ((typeof(local_path) !== "undefined") && local_path !== null) {
			CMD = "cd " + local_path + " && git rev-list HEAD --count";
		}
		var temp = exec.execSync(CMD).toString().replace("\n", "");
		this.version = parseInt(temp, 10);
		return this.version;
	}

	getRevision(local_path) {
		var CMD = "cd " + app_config.project_root + " && git rev-parse HEAD";
		if ((typeof(local_path) !== "undefined") && local_path !== null) {
			CMD = "cd " + local_path + " && git rev-parse HEAD";
		}
		var temp = exec.execSync(CMD).toString().replace("\n", "");
		this.revision = temp;
		return temp;
	}

	// returns (platform); or calls back (success, platform)

	getPlatform(local_path, callback) {

		const manifest_path = local_path + "/thinx.json";

		console.log("getPlatform on path: " + manifest_path);

		if (typeof(local_path) === "undefined") {
			callback(false, "local_path not defined");
			return;
		}

		// TODO: Use manifest if exists?
		var hasManifest = fs.existsSync(manifest_path); // try to read yml with node.js

		// Arduino

		var results = [];
		var isArduino = false;
		var inos = finder.from(local_path).findFiles('*.ino');
		var xinos = [];

		// Ignore all files in /examples/ (Arduino libs)
		for (var inoindex in inos) {
			if (inos[inoindex].indexOf("/lib/") === -1) {
				xinos.push(inos[inoindex]);
				results.push(xinos);
			}
		}

		console.log("found xinos: "+JSON.stringify(xinos));

		if (xinos.length > 0) isArduino = true;

		var isPlatformio = fs.existsSync(local_path + "/platformio.ini");
		if (isPlatformio) isArduino = false;

		var isNodeJS = fs.existsSync(local_path + "/package.json");
		if (isNodeJS) isNodeJS = true;

		var isLua = fs.existsSync(local_path + "/init.lua");

		var isPython = (fs.existsSync(local_path + "/boot.py") ||
			fs.existsSync(local_path + "/main.py"));

		var isMOS = fs.existsSync(local_path + "/mos.yml"); // https://mongoose-os.com/downloads/esp8266.zip

		var platform = "unknown";
		// TODO: Assign platforms by plugin implementations instead of this, extact matching functions!

		if (isPlatformio) {
			platform = "platformio";
		} else if (isArduino) {
			platform = "arduino";
		} else if (isPython) {
			platform = "python";
		} else if (isLua) {
			platform = "nodemcu";
		} else if (isMOS) {
			platform = "mongoose";
		} else if (isNodeJS) {
			platform = "nodejs";
		} else {
			console.log("Platform could not be inferred.");
		}

		console.log("Platform: "+platform);

		var yml_platform = this.getPlatformFromPath(local_path);
		if (yml_platform !== null) {
			platform = yml_platform;
		}

		if (platform == "unknown") {
			console.log("Exiting on unknown platform.");
			callback(false, "unknown_platform");
		}

		if (typeof(callback) !== "undefined") {
			callback(true, platform);
		} else {
			return platform;
		}
	}

};
