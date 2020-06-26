/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
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

		console.log("incoming hook body:", {info});

		/* sample hook data
		{
			"ref": "refs/heads/autobuild",
			"before": "0000000000000000000000000000000000000000",
			"after": "8f625c5f87b3ec2d0754f2cc554ee8b70e8ecb01",
			"repository": {
				"id": 161080151,
				"node_id": "MDEwOlJlcG9zaXRvcnkxNjEwODAxNTE=",
				"name": "keyguru-firmware-zion",
				"full_name": "suculent/keyguru-firmware-zion",
				"private": true,
				"owner": {
		*/

		var sources = new Sources();
		var repository = info.repository;
		var name = repository.name;
		var full_name = repository.full_name;

		if (full_name.indexOf("suculent/thinx-device-api") !== -1) {
			console.log("[repository.js:watch] » Skipping webhook own self.");
			return false;
		}

		console.log("in process_hook, info:", {info});

		var repositories = Repository.findAllRepositoriesWithFullname(name);
		if (repositories.length == 0) {
			console.log("No repositories found with filter " + full_name);
			return false;
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
		
		return true;
	}
};
