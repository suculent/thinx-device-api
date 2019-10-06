/** This THiNX-RTM API module is responsible for managing Sources. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var db = app_config.database_uri;
var fs = require("fs-extra");

var userlib = require("nano")(db).use(prefix + "managed_users");
var devicelib = require("nano")(db).use(prefix + "managed_devices");

var mkdirp = require("mkdirp");
var sha256 = require("sha256");
var exec = require("child_process");
var path = require("path");
var uuidV1 = require("uuid/v1");

var Repository = require("./repository"); var repository = new Repository();
var Sanitka = require("./sanitka"); var sanitka = new Sanitka();

var rsakey = require("./rsakey"); var RSAKey = new rsakey();

module.exports = class Sources {

	// Private functions
	upsertDevice(device) {
		devicelib.destroy(device._id, device._rev, (err) => {
			delete device._rev;
			devicelib.insert(device, device._rev, (err)  => {
				console.log(err);
			});
		});
	}

	removeSourcesFromOwner(owner, removed_sources) {
		devicelib.view("devicelib", "devices_by_owner", {
			key: owner,
			include_docs: true
		}, (err, body) => {

			if (err) {
				console.log(err);
				// no devices to be detached
			}

			if (body.rows.length === 0) {
				console.log("no-devices to be detached; body: " +
				JSON.stringify(body));
				// no devices to be detached
			}

			for (var rindex in body.rows) {
				var device;
				if (typeof(body.rows[rindex]) === "undefined") continue;
				if (body.rows[rindex].value !== null) {
					device = body.rows[rindex].value;
				}
				if ((typeof(device) === "undefined")) continue;
				if (device === null) continue;
				if (device.source === null) continue;
				for (var sindex in removed_sources) {
					var removed_source_id = removed_sources[sindex];
					if (device.source == removed_source_id) {
						console.log(
							"repo_revoke alias equal: Will destroy/insert device: " +
							device.source + " to " + removed_source_id
						);
						device.source = null;
						this.upsertDevice(device);
					}
				}
			}
		});
	}

	upsertOwnerSource(doc, callback) {
		userlib.destroy(doc._id, doc._rev, (err) => {
			delete doc._rev;
			userlib.insert(doc, doc._id, (err, body, header) => {
				callback(err);
			});
		});
	}

	addSourceToOwner(owner, source, temporary_source_path, source_callback) {
		userlib.get(owner, (err, doc) => {
			if (err) {
				console.log(err);
				source_callback(false, err);
				return;
			}
			if (!doc) {
				console.log("Owner " + owner + " not found.");
				source_callback(false, "user_not_found");
				return;
			}
			var sid = sha256(JSON.stringify(source) + new Date().toString());
			doc.repos[sid] = source;
			this.upsertOwnerSource(doc, (err) => {
				if (err) {
					console.log("/api/user/source ERROR:" + err);
					source_callback(false, "source_not_added");
					return;
				}
				fs.removeSync(temporary_source_path);
				source_callback(true, {
					success: true,
					source_id: sid
				});
			});
		});
	}

	updateUserWithSources(doc, sources, really_removed_repos, callback) {
		userlib.destroy(doc._id, doc._rev, (err) => {
			doc.repos = sources;
			delete doc._rev;
			userlib.insert(doc, doc._id, (err, body, header) => {
				if (err) {
					console.log("/api/user/source ERROR:" + err);
					if (typeof(callback) !== "undefined") callback(false, "source_not_removed");
					return;
				}
				if (typeof(callback) !== "undefined") callback(true, {
					success: true,
					source_ids: really_removed_repos
				}); // callback
			}); // insert
		}); // destroy
	}

	gitFetchWithKeys(owner, command) {
		var success = false;
		let result;
		console.log("No problem for Sources, re-try using SSH keys (TODO: should cleanup first)...");
		const key_paths = RSAKey.getKeyPathsForOwner(owner);
		if (key_paths.count < 1) {
			console.log("no_rsa_keys_found"); // todo: build or audit log
			return false;
		}
		for (var kindex in key_paths) {
			var prefix = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
			console.log("git prefix: " + prefix);
			try {
				result = exec.execSync(prefix + command + "'").toString().replace("\n", "");
				console.log("[sources] git rsa clone result: " + result);
				success = true;
				break;
			} catch (e) {
				console.log("git rsa clone error: "+e);
				success = false;
			}
		}
		return success;
	}

	gitPrefetch(CMD, path) {
		var result = null;
		try {
			console.log("Running command "+CMD);
			result = exec.execSync(CMD).toString().replace("\n", "");
		} catch (e) {
			console.log("[sources] clone_and_recurse_exception " + e);
			if (typeof(result) !== "undefined" && result !== null) {
				console.log("GIT clone error: " + result.toString());
			}
			// Should not exit until trying keys... no return here.
		}

		// Try to solve access rights issue by using owner keys...
		var git_success = fs.existsSync(path + "/*");
		console.log("Initial prefetch successful? : " + git_success);
		console.log("GIT Fetch Result: " + result); // result unused after this point
		return git_success;
	}

	cleanupDirectory(cleanup_path) {
		try {
			var CLEANUP = "cd " + cleanup_path + "; rm -rf *";
			exec.execSync(CLEANUP);
		} catch (e) {
			console.log(e);
		}
	}

	// Public

	/**
	* List:
	*/

	list(owner, callback) {
		userlib.get(owner, (err, doc) => {
			if (err) {
				console.log(err);
				callback(false, err);
				return;
			}
			if (doc) {
				callback(true, doc.repos);
			} else {
				console.log("Owner " + owner + " not found.");
				callback(false, "user_not_found");
			}
		});
	}

	/**
	* Add
	*/

	add(source, callback) {

		if (typeof(source.owner) === "undefined") {
			callback(false, "owner_undefined"); return;
		}
		const temp_id = uuidV1();
		const OWNER_PATH = app_config.data_root +
										 app_config.build_root + "/" +
										 source.owner;
		var TEMP_PATH = OWNER_PATH + "/" + temp_id;
		mkdirp.sync(TEMP_PATH);
		this.cleanupDirectory(TEMP_PATH);

		console.log("adding source: ", { source });

		// Set default branch if not defined
		if (typeof(source.branch) === "undefined") {
			source.branch = "origin/master";
		}

		// Sanitize branch name before using with shell commands
		var sanitized_branch = sanitka.branch(source.branch);

		// refactor: side-effects
		if (sanitized_branch.length !== source.branch.replace("origin/", "").length) {
			console.log("Invalid sanitized branch name: "+sanitized_branch+" does not equals to "+source.branch);
			callback(false, "invalid branch name"); return;
		}
		var sanitized_url = sanitka.url(source.url);
		if (sanitized_url.length != source.url.length) {
			callback(false, "Invalid Git URL"); return;
		}

		var PREFETCH_CMD = "set +e;" + " cd " + TEMP_PATH + "; " +
						"if $(git clone --recurse-submodules -b " +
						sanitized_branch + " " + sanitized_url + "); " + "then cd * " +
						"&& echo { \"basename\":\"$(basename $(pwd))\", \"branch\":\"" +
						sanitized_branch + "\" } > basename.json; fi";

		if (source.branch === null) {
			PREFETCH_CMD = "set +e; cd " + TEMP_PATH + "; if $(git clone --recurse-submodules " + sanitized_url +
			"); then cd * && echo { \"basename\":\"$(basename $(pwd))\", \"branch\":\"master\" } > basename.json; else rm -rf *; fi";
		}
		// TODO: CMD is not considered safe here... even with sanitized_url
		// Try to solve access rights issue by using owner keys...
		const git_success = this.gitPrefetch(PREFETCH_CMD, TEMP_PATH);
		if ( git_success == false || git_success == [] ) {
			this.cleanupDirectory(TEMP_PATH);
			if (!this.gitFetchWithKeys(source.owner, PREFETCH_CMD)) {
			 	callback(false, "Git fetch failed."); return;
			}
		}

		// Get inner path
		var directories = fs.readdirSync(TEMP_PATH).filter(
			file => fs.lstatSync(path.join(TEMP_PATH, file)).isDirectory()
		);
		var inner_path = TEMP_PATH + "/";
		if (typeof(directories[0]) !== "undefined" && directories[0] !== null)
			inner_path = TEMP_PATH + "/" + directories[0];

		// Fetch platform from inner path and call back to add source to owner and call back to router
		console.log("REPO_INNER_PATH: " + inner_path);
		source.platform = repository.getPlatform(inner_path, (success, platform) => {
			if (success) {
				console.log("Source added. Platform: "+platform);
			} else {
				console.log("Source add failed! Platform: "+platform);
			}
			source.initial_platform = platform; // should happen only on add
			console.log("Will add source to owner: "+ { source }, " path: "+TEMP_PATH+" with callback.");
			this.addSourceToOwner(source.owner, source, TEMP_PATH, callback);
		});
	}

	/**
	* Revoke Source for owner
	* @param {string} owner - owner._id
	* @param {string} sources - array of source_ids to be revoked
	* @param {function} callback(success, message) - operation result callback
	*/

	remove(owner, removed_sources, callback) {

		userlib.get(owner, (err, doc) => {

			if (err) {
				console.log(err);
				if (typeof(callback) !== "undefined") callback(false, err);
				return;
			}

			if (!doc) {
				console.log("Owner " + owner + " not found.");
				callback(false, "user_not_found");
				return;
			}

			var sources = doc.repos;
			var source_ids = Object.keys(sources);
			var really_removed_repos = [];
			for (var source_id in removed_sources) {
				var removed_source_id = removed_sources[source_id];
				var sources_source_id = sources[removed_source_id];
				if ((typeof(sources_source_id) !== "undefined") && (sources_source_id !== null)) {
					really_removed_repos.push(source_ids[source_id]);
					delete sources[removed_source_id];
				}
			}
			this.updateUserWithSources(doc, sources, really_removed_repos, callback);
			this.removeSourcesFromOwner(owner, removed_sources);
		});
	}

	updatePlatform(owner, source_id, platform) {
		userlib.get(owner, (err, doc)  => {
			if (err) {
				console.log(err);
				return false;
			}
			if (!doc) {
				console.log("Owner " + owner + " not found.");
				return false;
			}
			// Update user with new repos
			userlib.destroy(doc._id, doc._rev, (err) => {
				delete doc._rev;
				doc.repos[source_id].platform = platform;
				userlib.insert(doc, doc._id, (err, body, header) => {
					console.log("updatePlatform ERROR:" + err + " to: "+platform);
				});
			});
		});
	}
};
