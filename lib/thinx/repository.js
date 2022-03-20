/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var finder = require("fs-finder");

var Devices = require("./devices"); var devices = new Devices(); // we need Devices but without messenger, only the DB access for udids with source...
var Sources = require("./sources");
var Platform = require("./platform");

let fs = require("fs-extra");
module.exports = class Repository {

	constructor(queue) {
		this.queue = queue;
		this.platform = new Platform();

		this.exit_callback = (status, repository) => {
			console.log("EMPTY exit_callback status: ", { status });
			if (repository.changed) {
				console.log("EMPTY ON CHANGE this.exit_callback with status", status, " - repository changed.", repository);
			}
		};

		console.log("✅ [info] Loaded module: Repository Watcher");
	}

	static findAllRepositories() {
		var repositories_path = app_config.data_root + app_config.build_root;
		var repo_gits = finder.from(repositories_path).showSystemFiles().findDirectories(".git");
		console.log(`ℹ️ [info] [findAllRepositories] Search completed with ${repo_gits.length} repos: ${repositories_path}`);
		return repo_gits;
	}

	static findAllRepositoriesWithFullname(full_name) {
		var repo_gits = Repository.findAllRepositories();
		var repositories = [];
		console.log(`ℹ️ [info] [findAllRepositoriesWithFullname] Searching repos with fullname '${full_name}' in ${repo_gits}`);
		for (var dindex in repo_gits) {
			const repo = repo_gits[dindex];
			if (repo.indexOf(full_name) == -1) continue;
			if ((repo.length > 6) && (repo.indexOf("/.git") !== -1 && repo.indexOf("/.git") == repo.length - 5)) {
				repositories.push(repo.replace("/.git", ""));
			}
		}
		console.log(`ℹ️ [info] [findAllRepositoriesWithFullname] Searching repos completed with ${repositories.length} repos.`);
		return repositories;
	}

	// if the folder in device is not latest, cal be deleted
	isNotLatest(path, latest) {
		return (path.indexOf("/" + latest) == -1);
	}

	purge_old_repos_with_full_name(repositories, name) {
		
		const deviceFolders = (repos) => {
			if (typeof(repos) === "undefined") return [];
			if (repos === null) return [];
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
			return fs.readdirSync(source, { withFileTypes: true }) // lgtm [js/path-injection]
				.filter(dirent => dirent.isDirectory())
				.map(dirent => source + "/" + dirent.name);
		};

		let device_folders = deviceFolders(repositories);
		for (let index in device_folders) {
			let device_folder = device_folders[index];
			console.log(`🔨 [debug] [repository] device_folder ${device_folder}`);
			let all_in_device_folder = getDirectories(device_folder);
			console.log(`🔨 [debug] [repository] all_in_device_folder ${all_in_device_folder}`);
			let latest_in_device_folder = getMostRecentDirectory(all_in_device_folder);
			if (typeof (latest_in_device_folder) === "undefined" || latest_in_device_folder === null) {
				continue;
			}
			console.log(`🔨 [debug] [repository] latest_in_device_folder ${latest_in_device_folder}`);
			let latest_build_id_arr = latest_in_device_folder.toString().split("/");
			if (typeof (latest_build_id_arr) === "undefined" || latest_build_id_arr === null) {
				continue;
			}
			let latest_build_id = latest_build_id_arr[latest_build_id_arr.length-1];
			console.log(`🔨 [debug] [repository] latest_build_id ${latest_build_id} in device folder ${device_folder} parsing ${all_in_device_folder}`);
			if ((typeof (latest_build_id) === "undefined") || (latest_build_id === "undefined")) {
				continue;
			}
			for (let dindex in all_in_device_folder) {
				let folder = all_in_device_folder[dindex];
				let canBeDeleted = this.isNotLatest(folder, latest_build_id);
				let repo_folder = getDirectories(folder)[0];
				if (canBeDeleted && (repo_folder.indexOf(name) !== -1)) {
					console.log(`ℹ️ [info] Purging old repo folder ${folder}`);
					fs.rmdirSync(folder, { recursive: true });
				}
			}
		
		}
	}

	process_hook(req) {

		// TODO: FIXME: validate source.secret against req.header");

		let sources = new Sources();
		let info = req.body;
		let repository = info.repository;

		if (typeof (repository) === "undefined") {
			console.log("☣️ [error] Unknown webhook request info: ", { info });
			return;
		}

		var name = repository.name;
		var full_name = repository.full_name;

		var repositories = Repository.findAllRepositoriesWithFullname(name);
		if (repositories.length == 0) {
			console.log(`⚠️ [warning] No repositories found with filter ${full_name}`);
			return false;
		}

		this.purge_old_repos_with_full_name(repositories, name);

		repositories = Repository.findAllRepositoriesWithFullname(name);

		for (let local_path of repositories) {
			let owner_id = sources.ownerIdFromPath(local_path);
			// TODO: Fetch owner sources and validate source.secret if any to github header if any
			// If no source.secret is set in repository, ignore github secret
			sources.withRepository(info, local_path, (source_ids) => {
				if (typeof (source_ids) === "undefined" || source_ids.length == 0) {
					return;
				}
				for (let source_id of source_ids) {
					console.log(`ℹ️ [info] Fetching matching devices for changed source_id ${source_id}`);
					devices.udidsWithSource(owner_id, source_id, (udids) => {
						console.log("udids with source", source_id, ":", udids);
						for (let udid of udids) {
							console.log(`ℹ️ [info] Adding device ${udid} with this source.`);
							this.queue.add(udid, source_id, owner_id);
						}
					});
				}
			});
		}
		return true;
	}
};
