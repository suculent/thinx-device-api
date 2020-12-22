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

	constructor(builder) {
		if ((typeof(builder) !== "undefined") && (builder !== null)) {
			this.queue = new Queue(builder); // does not start cron automatically
			console.log("This Repository instance holds the builder queue.");
		} else {
			console.log("This Repository instance does not initiate builder queue.");
			this.queue = new Queue(null);
		}
		this.platform = new Platform();

		this.exit_callback = (status, repository) => {
			console.log("EMPTY exit_callback status: ", {status});
			if (repository.changed == true) {
				console.log("EMPTY ON CHANGE this.exit_callback with status", status, " - repository changed.", repository);
			}
		};
	}

	static findAllRepositories() {
		var repositories_path = app_config.data_root + app_config.build_root;
		console.log("[findAllRepositories] Searching repos in: " + repositories_path);
		var repo_gits = finder.from(repositories_path).showSystemFiles().findDirectories(".git");
		console.log("[findAllRepositories] Search completed with repos:", repo_gits.length);
		return repo_gits;
	}

	static findAllRepositoriesWithFullname(full_name) {
		var repo_gits = Repository.findAllRepositories();
		var repositories = [];
		console.log("[findAllRepositories] Searching repos with fullname: ", full_name);
		for (var dindex in repo_gits) {
			const repo = repo_gits[dindex];
			if (repo.indexOf(full_name) == -1) continue;
			if ((repo.length > 6) && (repo.indexOf("/.git") !== -1 && repo.indexOf("/.git") == repo.length - 5)) {
				repositories.push(repo.replace("/.git", ""));
			}
		}
		console.log("[findAllRepositories] Searching repos completed with count: ", repositories.length); 
		return repositories;
	}

	process_hook(info) {

		let sources = new Sources();
		let repository = info.repository;

		if (typeof(repository) === "undefined") {
			console.log("Unknown webhook request info: ", {info});
			return;
		}

		var name = repository.name;
		var full_name = repository.full_name;

		// Can be used for better/faster matching and prevent mismatching repos with same names from multiple origins
		// var http_url = repository.url;
		// var ssh_url = repository.ssh_url;

		if (full_name.indexOf("suculent/thinx-device-api") !== -1) {
			console.log("[repository.js:watch] » Skipping webhook own self.");
			return false;
		}

		var repositories = Repository.findAllRepositoriesWithFullname(name);
		if (repositories.length == 0) {
			console.log("No repositories found with filter " + full_name);
			return false;
		}
		
		console.log("[repository.js:watch] Found " + repositories.length + " repositories with name: " + name);

		let owner_ids = []; // should be treated as set, not as an array
		for (var rindex = 0; rindex < repositories.length; rindex++) {
			let local_path = repositories[rindex];
			console.log("Webhook in", local_path);
			let owner_id = sources.ownerIdFromPath(local_path);
			if (owner_id == null) {
				console.log("Inferring owner_id failed!");
				return false;
			} 
			// add new sources for this owner
			if (!owner_ids.includes(owner_id)) {
				sources.withRepository(info, local_path, (source_ids) => {
					if (source_ids.length > 0)
						//console.log("sources.withRepository returned:", source_ids);
					for (var oindex = 0; oindex < source_ids.length; oindex++) {
						let source_id = source_ids[oindex];
						//console.log("Fetching matching devices for changed for source_id", source_id);
						devices.udidsWithSource(owner_id, source_id, (udids) => {
							//console.log("udids", udids);
							for (var i = 0; i < udids.length; i++) {
								//console.log("adding to queue:", udids[i], source_id, "for owner", owner_id);
								this.queue.add(udids[i], source_id, owner_id);
							}
						});
					}
				});
			} else {
				// console.log("owner_ids", owner_ids, "do not include owner_id", owner_id);
			}
		}
		return true;
	}
};
