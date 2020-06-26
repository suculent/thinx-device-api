/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require("fs-extra");
var exec = require("child_process");
var githooked = require("githooked");
var finder = require("fs-finder");

var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
var Devices = require("./devices"); var devices = new Devices(); // we need Devices but without messenger, only the DB access for udids with source...
var Queue = require("./queue");
var Sources = require("./sources");
var Platform = require("./platform");

var nochange = "Already up-to-date.";

module.exports = class Repository {

	constructor(optional_devices) {
		if (typeof(optional_devices) !== "undefined") {
			this.devices = optional_devices;
		} else {
			this.devices = [];
		}
		this.queue = new Queue(); // does not start cron automatically
		this.platform = new Platform();
		this.exit_callback = (status, repository) => {
			console.log("exit_callback status: ", {status});
			if (repository.changed == true) {
				console.log("Empty this.exit_callback with status", status, " - repository changed.", repository);
			}
		};

		this.gh = githooked(); // should be set lazily using watch() trigger, not in constructor... just testing

		githooked().on('push', (info) => {
			console.log('A githooked ref ' + info.ref + ' was pushed.');
			console.log({info});
			this.process_hook(info);
		});
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

		var sources = new Sources();
		var repository = info.repository;
		var name = repository.name;
		var full_name = repository.full_name;

		if (full_name.indexOf("suculent/thinx-device-api") !== -1) {
			console.log("[repository.js:watch] » Skipping webhook own self.");
			return;
		}

		console.log("in process_hook, info:", {info});

		var repositories = Repository.findAllRepositoriesWithFullname(name);
		if (repositories.length == 0) {
			console.log("No repositories found with filter " + full_name);
			return;
		}
		
		console.log("[repository.js:watch] Found " + repositories.length + " repositories with name: " + name);

		for (var rindex in repositories) {
			console.log("Checking repository changes in", repositories[rindex], "for ref", info.ref);
			let source_ids = sources.withRepository(info, local_path);
			let owner_id = sources.ownerIdFromPath(local_path);
			source_ids.forEach(source_id => {
				let udids = devices.udidsWithSource(source_id);
				for (const udid in udids) {
					console.log("adding to queue:", udid, source_id);
					this.queue.add(udid, source_id, owner_id);
				}
			});
		}
	}

	init_githooked() {

		let hook = githooked();

		try {
			hook.listen(app_config.webhook_port, "0.0.0.0"); // this is USER GIT webhook!
			console.log("» Webhook sucessfuly initialized.");
		} catch (e) {
			// may fail if instance is not a master
			console.log("githooked init error", e);
		}

		hook.on('push', (info) => {
			console.log('B githooked ref ' + info.ref + ' was pushed.');
			console.log({info});
			this.process_hook(info);
		});

		hook.on('delete', (info) => {
			console.log('B githooked ref ' + info.ref + ' was deleted. TODO: Prune source.');
			this.process_hook(info);
			console.log(JSON.stringify(info));
		});

		hook.on('error', (msg) => {
			console.log("B githooked error: " + msg);
		});

		return hook;
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

	check_local_path_early_exit(local_path, check_callback) {
		if (typeof (local_path) === "undefined" || (local_path == null)) {
			console.log("[check_local_path_early_exit] local path undefined!");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		if (local_path === []) {
			console.log("[check_local_path_early_exit] local path is empty array!");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		if (!fs.existsSync(local_path)) {
			console.log("[check_local_path_early_exit] Repository local path " + local_path + " not found.");
			this.checkCallbackWithParams(check_callback, {
				local_path: local_path,
				version: "n/a",
				revision: "n/a",
				changed: false
			});
			return false;
		}

		if (local_path.indexOf("undefined") !== -1) {
			console.log("[check_local_path_early_exit]: Incorrect local_path " + local_path);
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

		var local_path = sanitka.url(unsanitized_path);
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

	watch() {

		if (!(require('cluster').isMaster)) {
			console.log("[repository.js:watch] » Skipping Git Webhook on slave instance (not needed): " + process.env.NODE_APP_INSTANCE);
			return;
		}

		// will deprecate
		if (typeof (process.env.CIRCLE_USERNAME) !== "undefined") {
			return; // webhook listener is not supported in automated tests
		}
		
		console.log("[repository.js:watch] » Starting User Webhook Listener on port", app_config.webhook_port);
		this.gh = this.init_githooked();

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
