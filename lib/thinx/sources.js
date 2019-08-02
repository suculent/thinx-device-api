/** This THiNX-RTM API module is responsible for managing Sources. */

var Sources = (function() {

	var Globals = require("./globals.js");
	var app_config = Globals.app_config();
	var prefix = Globals.prefix();

	var db = app_config.database_uri;
	var fs = require("fs-extra");

	var userlib = require("nano")(db).use(prefix + "managed_users");
	var devicelib = require("nano")(db).use(prefix + "managed_devices");
	var repository = require("./repository");
	var sanitka = require("./sanitka");

	var mkdirp = require("mkdirp");
	var sha256 = require("sha256");
	var exec = require("child_process");
	var path = require("path");
	var uuidV1 = require("uuid/v1");

	// Private functions

	var upsert = function(device) {
		devicelib.destroy(device._id, device._rev, function(err) {
			delete device._rev;
			devicelib.insert(device, device._rev, function(err) {
				console.log(err);
			});
		});
	};

	var removeSourcesFromOwner = function(owner, removed_sources) {
		devicelib.view("devicelib", "devices_by_owner", {
			key: owner,
			include_docs: true
		},
		function(err, body) {

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
							device.source + " to " + source_id
						);
						device.source = null;
						upsert(device);
					}
				}
			}
		});
	};

	var addSourceToOwner = function (owner, source, callback) {
		userlib.get(owner, function(err, doc) {
			if (err) {
				console.log(err);
				callback(false, err);
				return;
			}
			if (!doc) {
				console.log("Owner " + owner + " not found.");
				callback(false, "user_not_found");
				return;
			}
			userlib.destroy(doc._id, doc._rev, function(err) {
				delete doc._rev;
				var sid = sha256(JSON.stringify(source) + new Date().toString());
				doc.repos[sid] = source;
				userlib.insert(doc, doc._id, function(err, body, header) {
					if (err) {
						console.log("/api/user/source ERROR:" + err);
						callback(false, "source_not_added");
						return;
					} else {
						fs.removeSync(TEMP_PATH);
						callback(true, {
							success: true,
							source_id: sid
						});
					}
				});
			});
		});
	};

	var updateUserWithSources = function(doc, sources, callback) {
		userlib.destroy(doc._id, doc._rev, function(err) {
			doc.repos = sources;
			delete doc._rev;
			userlib.insert(doc, doc._id, function(err, body, header) {
				if (err) {
					console.log("/api/user/source ERROR:" + err);
					callback(false, "source_not_removed");
					return;
				} else {
					callback(true, {
						success: true,
						source_ids: really_removed_repos
					});
				}
			});
		}); // userlib)
	};

	var gitFetchWithKeys = function(owner) {
		var success = false;
		console.log("No problem for Sources, re-try using SSH keys...");
		var key_paths = fs.readdirSync(app_config.ssh_keys).filter(
			file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
		);
		if (key_paths.count < 1) {
			console.log("no_rsa_keys_found"); // todo: build or audit log
			return false;
		}
		for (var kindex in key_paths) {
			var prefix = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
			console.log("git prefix: " + prefix);
			try {
				result = exec.execSync(prefix + CMD + "'").toString().replace("\n", "");
				console.log("[sources] git rsa clone result: " + result);
				success = true;
				break;
			} catch (e) {
				console.log("git rsa clone error: "+e);
				success = false;
			}
		}
		return success;
	};

	// public
	var _public = {

		/**
		* List:
		*/

		list: function(owner, callback) {
			userlib.get(owner, function(err, doc) {
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
		},

		/**
		* Add
		*/

		add: function(owner, alias, url, branch, callback) {

			var temp_id = uuidV1();

			var source = {
				alias: alias,
				url: url,
				branch: branch
			};

			if (typeof(owner) === "undefined") {
				callback(false, "owner_undefined");
			}

			// Prefetch and infer platform... (may take a while)

			var OWNER_PATH = app_config.data_root + app_config.build_root + "/" +
			owner;
			var TEMP_PATH = OWNER_PATH + "/" + temp_id;

			console.log("[add] owner path: " + OWNER_PATH);
			console.log("[add] repo path: " + TEMP_PATH);

			try {
				mkdirp.sync(TEMP_PATH);
			} catch (erro) {
				console.log(erro);
				callback(false, erro);
				return;
			}

			try {
				var CLEANUP = "cd " + TEMP_PATH + "; rm -rf *";
				exec.execSync(CLEANUP);
			} catch (e) {
				console.log(e);
			}

			// Attempt for at least some sanitation of the user input to prevent shell and JSON injection
			var sanitized_branch = sanitka.branch(branch);
			if (sanitized_branch.length != branch.length) {
				callback(false, "invalid branch name");
				return;
			}

			var sanitized_url = sanitka.url(url);
			if (sanitized_url.length != url.length) {
				callback(false, "Invalid Git URL");
				return;
			}

			var CMD = "set +e;" +
						  " cd " + TEMP_PATH + "; " +
							"if $(git clone --recurse-submodules -b " +
							sanitized_branch + " " + sanitized_url + "); " +
							"then cd * " +
							"&& echo { \"basename\":\"$(basename $(pwd))\", \"branch\":\"" +
							sanitized_branch +
							"\" } > basename.json; fi";

			if (sanitized_branch === null) {
				CMD = "set +e; cd " + TEMP_PATH + "; if $(git clone --recurse-submodules " + sanitized_url +
				"); then cd * && echo { \"basename\":\"$(basename $(pwd))\", \"branch\":\"master\" } > basename.json; fi";
			}

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
			var git_success = fs.existsSync(TEMP_PATH + "/*");
			console.log("Initial prefetch successful? : " + git_success);
			console.log("GIT Fetch Result: " + result);
			if ( git_success == false || git_success == [] ) {
				if (!gitFetchWithKeys(owner)) {
				 	callback(false, "Git fetch failed.");
					return;
				}
			}

			var directories = fs.readdirSync(TEMP_PATH).filter(
				file => fs.lstatSync(path.join(TEMP_PATH, file)).isDirectory()
			);

			console.log("Directories in: " + TEMP_PATH + " = "+ JSON.stringify(directories));
			var REPO_INNER_PATH = TEMP_PATH + "/";
			if (typeof(directories[0]) !== "undefined" && directories[0] !== null) {
				REPO_INNER_PATH = TEMP_PATH + "/" + directories[0];
			} else {
				console.log("No subdirectories found in " + REPO_INNER_PATH);
			}
			console.log("REPO_INNER_PATH: " + REPO_INNER_PATH);

			source.platform = repository.getPlatform(REPO_INNER_PATH);
			source.initial_platform = source.platform; // should happen only on add
			addSourceToOwner(owner, source, TEMP_PATH, callback);
		},

		/**
		* Revoke Source for owner
		* @param {string} owner - owner._id
		* @param {string} sources - array of source_ids to be revoked
		* @param {function} callback(success, message) - operation result callback
		*/

		remove: function(owner, removed_sources, callback) {

			userlib.get(owner, function(err, doc) {

				if (err) {
					console.log(err);
					callback(false, err);
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
				updateUserWithSources(doc, sources, callback);
				removeSourcesFromOwner(owner, removed_sources);
			});
		},

		updatePlatform: function(owner, source_id, platform) {
			userlib.get(owner, function(err, doc) {
				if (err) {
					console.log(err);
					callback(false, err);
					return;
				}
				if (!doc) {
					console.log("Owner " + owner + " not found.");
					callback(false, "user_not_found");
					return;
				}
				// Update user with new repos
				userlib.destroy(doc._id, doc._rev, function(err) {
					delete doc._rev;
					doc.repos[source_id].platform = platform;
					userlib.insert(doc, doc._id, function(err, body, header) {
						console.log("updatePlatform ERROR:" + err + " to: "+platform);
					});
				});
			});
		}
	};

	return _public;

})();

exports.list = Sources.list;
exports.add = Sources.add;
exports.remove = Sources.remove;
exports.updatePlatform = Sources.updatePlatform;
