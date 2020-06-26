/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var githooked = require("githooked");
var finder = require("fs-finder");

var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
var Devices = require("./devices"); var devices = new Devices(); // we need Devices but without messenger, only the DB access for udids with source...
var Queue = require("./queue");
var Sources = require("./sources");
var Platform = require("./platform");

var nochange = "Already up-to-date.";

module.exports = class Repository {

	constructor() {
		this.queue = new Queue(); // does not start cron automatically
		this.platform = new Platform();

		this.exit_callback = (status, repository) => {
			console.log("EMPTY exit_callback status: ", {status});
			if (repository.changed == true) {
				console.log("EMPTY ON CHANGE this.exit_callback with status", status, " - repository changed.", repository);
			}
		};

		githooked().on('hook', (info) => {
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

		githooked().on('push', (info) => {
			console.log('B githooked ref ' + info.ref + ' was pushed.');
			console.log({info});
			this.process_hook(info);
		});

		githooked().on('delete', (info) => {
			console.log('B githooked ref ' + info.ref + ' was deleted. TODO: Prune source.');
			this.process_hook(info);
			console.log(JSON.stringify(info));
		});

		githooked().on('error', (msg) => {
			console.log("B githooked error: " + msg);
		});

		try {
			githooked().listen(app_config.webhook_port, "0.0.0.0"); // this is USER GIT webhook!
			console.log("» Webhook sucessfuly initialized.");
		} catch (e) {
			// may fail if instance is not a master
			console.log("githooked init error", e);
		}

		return githooked();
	}

	watch() {

		if (!(require('cluster').isMaster)) {
			console.log("[repository.js:watch] » Skipping Git Webhook on slave instance (not needed): " + process.env.NODE_APP_INSTANCE);
			return;
		}

		// will deprecate
		if ((typeof (process.env.CIRCLE_USERNAME) !== "undefined") && (process.env.CIRCLE_USERNAME !== null)) {
			console.log("[repository.js:watch] » Skipping Git Webhook Circle CI.");
			return; // webhook listener is not supported in automated tests
		}
		
		console.log("[repository.js:watch] » Starting User Webhook Listener on port", app_config.webhook_port);
		this.gh = this.init_githooked();

	}
};
