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

let fs = require("fs-extra");
module.exports = class Repository {

	constructor(queue) {
		this.queue = queue;
		this.platform = new Platform();

		this.exit_callback = (status, repository) => {
			console.log("EMPTY exit_callback status: ", { status });
			if (repository.changed == true) {
				console.log("EMPTY ON CHANGE this.exit_callback with status", status, " - repository changed.", repository);
			}
		};
	}

	static findAllRepositories() {
		var repositories_path = app_config.data_root + app_config.build_root;
		var repo_gits = finder.from(repositories_path).showSystemFiles().findDirectories(".git");
		console.log("[findAllRepositories] Search completed with repos:", repo_gits.length);
		return repo_gits;
	}

	static findAllRepositoriesWithFullname(full_name) {
		var repo_gits = Repository.findAllRepositories();
		var repositories = [];
		console.log("[findAllRepositoriesWithFullname] Searching repos with fullname: ", full_name);
		for (var dindex in repo_gits) {
			const repo = repo_gits[dindex];
			if (repo.indexOf(full_name) == -1) continue;
			if ((repo.length > 6) && (repo.indexOf("/.git") !== -1 && repo.indexOf("/.git") == repo.length - 5)) {
				repositories.push(repo.replace("/.git", ""));
			}
		}
		console.log("[findAllRepositoriesWithFullname] Searching repos completed with count: ", repositories.length);
		return repositories;
	}

	purge_old_repos_with_full_name(repositories, name) {
		// TODO: Delete all but latest per-device first:
		// 1. Get list of device repos...
		// 2. Get latest per each...
		// 3. Delete all but latest per each...
		// ... then process only rest
		const deviceFolders = (repos) => {
			return repos
				.map((repo) => {
					let splitted = repo.split("/");
					return splitted.splice(0, splitted.length - 2).join("/");
				});
		};

		const getMostRecentDirectory = (repos) => {
			const files = orderRecentDirectories(repos);
			return files.length ? files[0] : undefined;
		};

		const orderRecentDirectories = (repos) => {
			return repos
				.filter((repo) => fs.lstatSync(repo).isDirectory())
				.map((repo) => ({ repo, mtime: fs.lstatSync(repo).mtime }))
				.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
		};

		const getDirectories = (source) => {
			return fs.readdirSync(source, { withFileTypes: true })
				.filter(dirent => dirent.isDirectory())
				.map(dirent => source + "/" + dirent.name);
		};

		let device_folders = deviceFolders(repositories);
		for (let index in device_folders) {
			let device_folder = device_folders[index];
			console.log("device_folder", device_folder);

			let all_in_device_folder = getDirectories(device_folder);
			console.log("all_in_device_folder", device_folder);

			let latest_in_device_folder = getMostRecentDirectory(all_in_device_folder);
			if (typeof (latest_in_device_folder) !== "undefined" && latest_in_device_folder !== null) {
				let latest_build_id_arr = latest_in_device_folder.toString().split("/");

				if (typeof (latest_build_id_arr) !== "undefined" && latest_build_id_arr !== null) {

					console.log("latest_build_id_arr", JSON.toString(latest_build_id_arr));
					let latest_build_id = latest_build_id_arr[latest_build_id_arr.length];
					if ((typeof (latest_build_id) !== "undefined") && (latest_build_id !== "undefined")) {
						console.log("latest_build_id", latest_build_id);
						for (let dindex in all_in_device_folder) {
							let folder = all_in_device_folder[dindex];
							if (folder.indexOf("/" + latest_build_id) !== -1) {
								console.log("Deleting ", folder);
								fs.rmdirSync(folder, { recursive: true });
							}
						}
					}
				}
			}
		}
	}

	process_hook(info) {

		let sources = new Sources();
		let repository = info.repository;

		if (typeof (repository) === "undefined") {
			console.log("Unknown webhook request info: ", { info });
			return;
		}

		var name = repository.name;
		var full_name = repository.full_name;

		var repositories = Repository.findAllRepositoriesWithFullname(name);
		if (repositories.length == 0) {
			console.log("No repositories found with filter " + full_name);
			return false;
		}

		this.purge_old_repos_with_full_name(repositories, name);

		repositories = Repository.findAllRepositoriesWithFullname(name);

		for (var rindex = 0; rindex < repositories.length; rindex++) {
			let local_path = repositories[rindex];
			let owner_id = sources.ownerIdFromPath(local_path);
			sources.withRepository(info, local_path, (source_ids) => {
				if (typeof (source_ids) !== "undefined" && source_ids.length > 0) {
					for (var oindex = 0; oindex < source_ids.length; oindex++) {
						let source_id = source_ids[oindex];
						console.log("Fetching matching devices for changed source_id", source_id);
						devices.udidsWithSource(owner_id, source_id, (udids) => {
							console.log("udids", udids);
							for (var i = 0; i < udids.length; i++) {
								console.log("Device with this source:", udids[i]);
								this.queue.add(udids[i], source_id, owner_id);
							}
						});
					}
				}
			});
		}
		return true;
	}
};
