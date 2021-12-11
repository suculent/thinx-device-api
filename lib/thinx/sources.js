/** This THiNX-RTM API module is responsible for managing Sources. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var fs = require("fs-extra");

var mkdirp = require("mkdirp");
var sha256 = require("sha256");
var exec = require("child_process");
var path = require("path");

var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
var AuditLog = require("./audit"); var alog = new AuditLog();
var Platform = require("./platform"); var _platform = new Platform();

var shellescape = require('shell-escape');

var Git = require("./git"); var git = new Git();

const { v1: uuidV1 } = require('uuid');

module.exports = class Sources {

	constructor() {
		this.devicelib = require("nano")(app_config.database_uri).use(prefix + "managed_devices");
		this.userlib = require("nano")(app_config.database_uri).use(prefix + "managed_users");
	}

	// Private functions
	upsertDevice(device) {
		this.devicelib.destroy(device._id, device._rev, () => {
			delete device._rev;
			this.devicelib.insert(device, device._rev, (ins_err) => {
				console.log(ins_err);
			});
		});
	}

	removeSourcesFromOwner(owner, removed_sources) {
		this.devicelib.view("devicelib", "devices_by_owner", {
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
				if (typeof (body.rows[rindex]) === "undefined") continue;
				if (body.rows[rindex].value !== null) {
					device = body.rows[rindex].value;
				}
				if ((typeof (device) === "undefined")) continue;
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

	upsertOwnerDocumentRepos(doc, callback) {
		var changes = { repos: doc.repos };
		this.userlib.get(doc._id, (error, body) => {
			if (error) {
				alog.log(doc._id, "Profile update error " + error, "error");
				callback(true, error);
				return;
			}
			this.userlib.atomic("users", "edit", doc._id, changes, (eerror, upsert_body) => {
				if (eerror === null) {
					callback(null, "source_added");
					return;
				}
				// retry on conflict? should not happen anymore
				console.log("ERR: " + eerror + " : " + JSON.stringify(upsert_body));
				this.userlib.atomic("users", "edit", doc._id, changes, (edit_error, edit_body) => {
					if (edit_error) {
						console.log("ERR: " + edit_error + " : " + JSON.stringify(edit_body));
						callback(true, "upsert_failed");
						alog.log(doc._id, "upsertOwnerDocumentRepos.", "error");
					} else {
						callback(null, "source_added");
						alog.log(doc._id, "Profile updated successfully.");
					}
				});
			});
		});
	}

	addSourceToOwner(owner, source, temporary_source_path, source_callback) {
		this.userlib.get(owner, (err, doc) => {
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
			this.upsertOwnerDocumentRepos(doc, (upsert_err) => {
				if (upsert_err !== null) {
					console.log("/api/user/source upsertOwnerDocumentRepos ERROR:" + upsert_err);
					source_callback(false, "source_not_added"); // why is this not same response as below? what about UI?
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
		this.userlib.destroy(doc._id, doc._rev, (err) => {
			doc.repos = sources;
			delete doc._rev;
			this.userlib.insert(doc, doc._id, (insert_err, body, header) => {
				if (insert_err) {
					console.log("/api/user/source updateUserWithSources ERROR:" + insert_err);
					if (typeof (callback) !== "undefined") callback(false, "source_not_removed");
					return;
				}
				if (typeof (callback) !== "undefined") callback(true, {
					success: true,
					source_ids: really_removed_repos
				}); // callback
			}); // insert
		}); // destroy
	}

	cleanupDirectory(cleanup_path) {
		try {
			var CLEANUP = "cd " + cleanup_path + "; rm -rf *";
			console.log("Will cleanup directoy at", cleanup_path);
			exec.execSync(CLEANUP);
		} catch (e) {
			console.log(e);
		}
	}

	// Public

	/**
	* List all owner's sources
	*/

	list(owner, callback) {
		if (typeof (owner) === "undefined") {
			callback(false, "user_not_defined");
			return;
		}
		this.userlib.get(owner, (err, doc) => {
			if (err) {
				console.log("this.userlib.get error", err);
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
	* List limited to repository/branch
	*/

	// TODO: Cover me with tests
	ownerIdFromPath(local_path) {
		let owner_path = local_path.replace(app_config.build_root, "");
		owner_path = owner_path.replace(app_config.data_root, "");
		owner_path = owner_path.replace("/", ""); // drop first leading slash
		let owner_path_array = owner_path.split("/");
		let owner_id = owner_path_array[0];
		if (owner_id.indexOf("repos") === 0) {
			owner_id = owner_path_array[1];
			console.log("overriding path array position, because /repos/ is first...");
		}
		return owner_id;
	}

	withRepository(info, local_path, callback) {
		
		let repo_name = info.repository.name;
		let repo_branch = "master";
		
		if (typeof(info.ref) !== "undefined") {
			repo_branch = info.ref.replace("refs/heads/", "");
		} 

		repo_branch = repo_branch.replace("origin", "");

		let owner_id = this.ownerIdFromPath(local_path);
		if (owner_id === null) {
			console.log("Webhook's owner not found!");
			return [];
		}
		this.userlib.get(owner_id, (err, doc) => {
			if (err != null) {
				console.log("withRepository error", err, doc);
				return [];
			}
			if (typeof (doc) === "undefined") {
				console.log("doc is undefined in withRepository() for owner", owner_id);
				return [];
			}
			var source_ids = [];
			let sources = doc.repos;
			let keys = Object.keys(sources);
			// parse all repos and return matching IDs
			for (let key of keys) {
				let source = sources[key];
				if (typeof(source.owner) !== "undefined") {
					if ((source.owner.indexOf(owner_id) != -1) &&
						(source.url.indexOf(repo_name) != -1) &&
						(source.branch.indexOf(repo_branch) != -1)) {
						source_ids.push(key);
					} 
				}
			}
			callback(source_ids);
		});

	}

	/**
	* Add (do not break, works)
	*/

	get_inner_path(temp_path) {
		var directories = fs.readdirSync(temp_path).filter(
			file => fs.lstatSync(path.join(temp_path, file)).isDirectory()
		);
		var inner_path = temp_path + "/";
		if (typeof (directories[0]) !== "undefined" && directories[0] !== null)
			inner_path = temp_path + "/" + directories[0];
		return inner_path;
	}

	getTempPath(owner, source_id) {
		const OWNER_ROOT = app_config.data_root + app_config.build_root + "/" + owner;
		var TEMP_PATH = OWNER_ROOT + "/" + source_id;
		mkdirp.sync(TEMP_PATH);
		return TEMP_PATH;
	}

	validateBranch(source, callback) {
		if (typeof (source.branch) === "undefined") {
			source.branch = "origin/master";
		}
		var sanitized_branch = sanitka.branch(source.branch); // replaces also "origin/"
		if (source.branch === null) {
			sanitized_branch = "master";
		}
		if (sanitized_branch.length !== source.branch.replace("origin/", "").length) {
			console.log("Invalid sanitized branch name: " + sanitized_branch + " does not equals to " + source.branch);
			callback(false, "invalid branch name"); return false;
		}
		return sanitized_branch;
	}

	validateURL(source, callback) {
		var sanitized_url = sanitka.url(source.url);
		sanitized_url = shellescape([sanitized_url]);
		sanitized_url = sanitka.deescape(sanitized_url);
		if (sanitized_url.length != source.url.length) {
			callback(false, "Invalid Git URL"); return false;
		}
		return sanitized_url;
	}

	// Performs pre-fetch to temporary directory, required for inferring target platform and verification.
	add(source, callback) {

		if (typeof (source) === "undefined") {
			callback(false, "source_undefined"); return;
		}

		if (typeof (source.owner) === "undefined") {
			callback(false, "source_owner_undefined"); return;
		}

		source.source_id = uuidV1();

		var TEMP_PATH = this.getTempPath(source.owner, source.source_id);

		//console.log("[sources add] with TEMP_PATH", TEMP_PATH);

		let sanitized_branch = this.validateBranch(source, callback);
		if (!sanitized_branch) return;

		let sanitized_url = this.validateURL(source, callback);
		if (!sanitized_url) return;

		// Re escaping: sanitized_url cannot be escaped using shellescape, because it adds unusable characters (' d)
		// chmoding for worker which is not root or thinx at the moment 
		var PREFETCH_CMD = "set +e; mkdir -p " + TEMP_PATH + "; cd " + TEMP_PATH + "; rm -rf *; " +
			"if $(git clone -b " + sanitized_branch + " \"" + sanitized_url + "\");" +
			"then cd * && chmod -R 776 * && echo { \"basename\":\"$(basename $(pwd))\", \"branch\":\"" + sanitized_branch + "\" } > ../basename.json; fi";

		console.log("[sources add] Calling PREFETCH_CMD", PREFETCH_CMD);

		// Try to solve access rights issue by using owner keys...
		const git_success = git.fetch(source.owner, PREFETCH_CMD, TEMP_PATH);
		if (git_success === false) {
			this.cleanupDirectory(TEMP_PATH);
			// retry? why?
			if (!git.fetch(source.owner, PREFETCH_CMD, TEMP_PATH)) {
				callback(false, "Git fetch failed.");
				return;
			}
		}

		var inner_path = this.get_inner_path(TEMP_PATH);

		_platform.getPlatform(inner_path, (success, platform) => {
			switch (success) {
				case true: {
					source.platform = platform;
					source.initial_platform = platform; // should happen only on add
					this.addSourceToOwner(source.owner, source, TEMP_PATH, callback); // returns success, response
					// this.cleanupDirectory(TEMP_PATH);
				} break;
				case false: {
					console.log("[sources add] getPlatform failed! Platform: " + platform);
				} break;
			}
		});
	}

	/**
	* Revoke Source for owner
	* @param {string} owner - owner._id
	* @param {string} sources - array of source_ids to be revoked
	* @param {function} callback(success, message) - operation result callback
	*/

	remove(owner, removed_sources, callback) {

		this.userlib.get(owner, (err, doc) => {

			if (err) {
				console.log(err);
				if (typeof (callback) !== "undefined") callback(false, err);
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
				if ((typeof (sources_source_id) !== "undefined") && (sources_source_id !== null)) {
					really_removed_repos.push(source_ids[source_id]);
					delete sources[removed_source_id];
				}
			}
			this.updateUserWithSources(doc, sources, really_removed_repos, callback);
			this.removeSourcesFromOwner(owner, removed_sources);
		});
	}

	updatePlatform(owner, source_id, platform) {
		if (typeof(platform) !== "string") {
			console.log("Invalid platform type submitted on update. Should have been a string.");
			return false;
		}
		this.userlib.get(owner, (err, doc) => {
			if (err) {
				console.log(err);
				return false;
			}
			if (!doc) {
				console.log("Owner " + owner + " not found.");
				return false;
			}
			// Update user with new repos
			this.userlib.destroy(doc._id, doc._rev, (destroy_err) => {
				delete doc._rev;
				doc.repos[source_id].platform = platform; // lgtm [js/prototype-polluting-assignment]
				this.userlib.insert(doc, doc._id, (insert_err, body, header) => {
					if (insert_err) {
						console.log("updatePlatform ERROR:", err, "to:", platform);
					}
				});
			});
		});
	}
};
