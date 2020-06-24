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

var Sources = require("./sources");
var Messenger = require("./messenger");
var Devices = require("./devices"); var devices = new Devices(); // we need Devices but without messenger, only the DB access for udids with source...
var Queue = require("./queue");
var Platform = require("./platform");

var nochange = "Already up-to-date.";

module.exports = class Repository {

	constructor(optional_devices) {
		if (typeof(optional_devices) !== "undefined") {
			this.devices = optional_devices;
		}
		this.gh = null;
		this.queue = new Queue(); // does not start cron automatically
		this.platform = new Platform();
		this.exit_callback = (status, repository) => {
			console.log("exit_callback status: ", {status});
			if (repository.changed == true) {
				console.log("Empty this.exit_callback with status", status, "is now used to start a BUILD if repository changed.", repository);
				// find all udids for changed sources and queue builds
				var sources = new Sources();
				let source_id = sources.withRepository(status.local_path);
				let udids = devices.udidsWithSource(source_id);
				for (const udid in udids) {
					console.log("adding to queue:", udid, source_id);
					this.queue.add(udid, source_id);
				}
			}
		};
	}

	static findAllRepositories() {
		var repositories_path = app_config.data_root + app_config.build_root + "/";
		console.log("Searching repos in: " + repositories_path);
		var repo_gits = finder.from(repositories_path).showSystemFiles().findDirectories(".git");
		return repo_gits;
	}

	static findAllRepositoriesWithFullname(full_name) {
		var repo_gits = Repository.findAllRepositories();
		var repositories = [];
		for (var dindex in repo_gits) {
			const repo = repo_gits[dindex];
			if (repo.indexOf(full_name) == -1) continue;
			if (repo.indexOf("/.git") == repo.length - 5) {
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

		console.log("[repository.js:watch] » GitHub Webhook called for Git repository: " + name);
		var repositories = Repository.findAllRepositoriesWithFullname(name);
		if (repositories.length == 0) {
			console.log("No repositories found with filter " + full_name);
			return;
		}

		console.log("\n[repository.js:watch] found repos: " + JSON.stringify(repositories));
		if (typeof (this.exit_callback) === "undefined") {
			this.exit_callback = () => {
				console.log("Exit callback was undefined, this is a placeholder. We don't probably need it here unless IT WOULD START A BUILD!.");
			};
		} else {
			console.log("Some exit callback function has been already defined...");
		}

		var sources = new Sources();

		console.log("[repository.js:watch] Found " + repositories.length + " repositories with name: " + name);

		for (var rindex in repositories) {
			console.log("Checking repository changes in " + repositories[rindex]);
			new Repository()._checkRepositoryChange(repositories[rindex], false, this.exit_callback);

			// how to match repository to all devices that apply?
			// fetchDevicesForRepository?

			let source_id = sources.withRepository(repositories[rindex]);
			let udids = devices.udidsWithSource(source_id);
			for (const udid in udids) {
				console.log("adding to queue:", udid, source_id);
				this.queue.add(udid, source_id);
			}
		}
	}

	init_githooked(gh) {

		try {
			gh.listen(app_config.webhook_port, "0.0.0.0"); // this is USER GIT webhook!
			console.log("» Webhook sucessfuly initialized.");
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
					console.log("Selecting " + adir);
				}
			}
		}
		return git_dirs;
	}

	checkCallbackWithParams(check_callback, params) {
		if (typeof (check_callback) === "function") {
			check_callback(params);
		}
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
				console.log("git rsa clone error (cleaning up...): " + e);
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

	check_local_path_early_exit(local_path, check_callback) {
		if (typeof (local_path) === "undefined" || (local_path == null)) {
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

		if (local_path.indexOf("undefined") !== -1) {
			console.log("[REPOSITORY].js:312: Incorrect local_path " + local_path);
			return false;
		}

		return true;
	}

	check_git_dir_valid(local_path, owner_id, check_callback) {
		var all_dirs = finder.from(local_path).showSystemFiles().findDirectories("\/.git");
		var git_dirs = this.filterGitDirs(all_dirs, owner_id);

		// In case there is not even one git dir on local path,
		// this is not a directory and rest should be skipped.
		console.log("[check_git_dir_valid]: git_dirs found: " + JSON.stringify(git_dirs));
		if (!fs.lstatSync(local_path).isDirectory() || (git_dirs.length === 0)) {
			console.log("[check_git_dir_valid]: This is not a git repo: " + __dirname + "(localpath: " + local_path + "/.git )");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}
		return true;
	}

	check_git_dir_exists(local_path, check_callback) {
		// Check if the git folder exists
		const git_path = (local_path + "/.git").replace("//", "/");
		if (!fs.existsSync(git_path)) {
			console.log("[check_git_dir_exists] No .git folder found in git_path " + git_path);
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}
	}

	safe_git_path(unsanitized_path, repeat, check_callback) {

		var local_path = this.stripDangerousCharacters(unsanitized_path);
		const owner_id = this.extractOwnerFromLocalPath(local_path);

		local_path.replace("./", app_config.data_root); // temporal coupling to local path!

		if (!this.check_local_path_early_exit(local_path, check_callback)) {
			return false;
		}
		// now the gitdir should be really valid
		if (!this.check_git_dir_valid(local_path, owner_id, check_callback)) {
			return false;
		}
		if (!this.check_git_dir_exists(local_path, check_callback)) {
			return false;
		}

		return local_path;
	}

	_checkRepositoryChange(local_path, repeat, check_callback) {

		let sanitized_path = this.safe_git_path(local_path, repeat, check_callback);
		if (sanitized_path === false) {
			// can safely exit, check_callback must be called in safe_git_path
			return;
		}

		const CMD = "bash -c 'cd " + sanitized_path + "; git status; ls; git reset --hard; git pull --recurse-submodules'";
		console.log("[checkRepositoryChange] CMD: " + CMD);

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
		if (git_success == false || git_success == []) {
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
		// Scheduling (deprecated, will be pulled again next time)
		//

		// TODO: INSTEAD OF THIS SCHEDULER, WE NEED TO SCHEDULE A BUILD INTO QUEUE

		if (this.timer !== null) {
			clearTimeout(this.timer);
		}
		if (temp.indexOf(nochange) !== -1 && repeat) {
			// watcher needs to be set before calling check
			console.log("Watcher: " + JSON.stringify(this.watcher));
			if (typeof (this.watcher) !== "undefined" || this.watcher !== null) {
				console.log("[REPOSITORY].js:299: Setting watcher timer for " + local_path);
				this.timer = setTimeout(this._watcherTimeoutFunction(
					local_path,
					repeat,
					check_callback), 30000);
			}
			return false;
		}

		this.checkCallbackWithParams(check_callback, {
			local_path: local_path,
			version: this.version,
			revision: this.revision,
			changed: true
		});
		return true;
	}

	watch() {

		if (!(require('cluster').isMaster)) {
			console.log("[repository.js:watch] » Skipping Git Webhook on slave instance (not needed): " + process.env.NODE_APP_INSTANCE);
			return;
		}

		// will deprecate
		if (typeof (process.env.CIRCLE_USERNAME) !== "undefined") {
			return; // not supported on circle, why?
		}

		console.log("[repository.js:watch] » Starting User Webhook Listener on port", app_config.webhook_port);
		if (this.gh == null) {
			this.gh = githooked("push", this.process_hook);
			this.init_githooked(this.gh);
		}

	}

	watchRepository(local_path, callback) {

		if (local_path === null) {
			if (typeof (callback) === "function") {
				callback(false, "invalid_local_path");
			} else {
				console.log("[watchRepository]: invalid local path, no callback");
			}
		}

		if ((typeof (callback) === "function")) {
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

		if (typeof (callback) === "undefined") {
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
			if (typeof (this.exit_callback) !== "undefined") {
				this.exit_callback();
			} else {
				console.log("[REPOSITORY] WARNING! Watcher has no callback.");
			}
		} else {
			console.log("[REPOSITORY] unwatchRepository: no watcher... exiting.");
			if (typeof (this.exit_callback) !== "undefined") {
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
		if ((typeof (local_path) !== "undefined") && local_path !== null) {
			CMD = "cd " + local_path + " && git rev-list HEAD --count";
		}
		var temp = exec.execSync(CMD).toString().replace("\n", "");
		this.version = parseInt(temp, 10);
		return this.version;
	}

	getRevision(local_path) {
		var CMD = "cd " + app_config.project_root + " && git rev-parse HEAD";
		if ((typeof (local_path) !== "undefined") && local_path !== null) {
			CMD = "cd " + local_path + " && git rev-parse HEAD";
		}
		var temp = exec.execSync(CMD).toString().replace("\n", "");
		this.revision = temp;
		return temp;
	}
};
