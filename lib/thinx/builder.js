/** This THiNX-RTM API module is responsible for managing builds and should be offloadable to another server. */

var Builder = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var ROOT = app_config.project_root;

	var uuidV1 = require("uuid/v1");

	var devicelib = require("nano")(db).use("managed_devices");
	var userlib = require("nano")(db).use("managed_users");
	var exec = require("child_process");

	var blog = require("./buildlog");

	// private
	var _private = {

		buildCommand: function(build_id, owner, git, udid, dryrun) {
			console.log("[BUILD_STARTED] Executing build chain...");

			var CMD = "cd " + ROOT + ";" + ROOT + "/builder --owner=" + owner +
				" --udid=" + udid +
				" --git=" +
				git + " --id=" + build_id;

			if (dryrun === true) {
				CMD = CMD + " --dry-run";
			}

			if (udid === null) {
				console.log("Cannot build without udid!");
				return;
			}

			console.log("Creting build log for udid: " + udid);
			console.log("[OID:" + owner +
				"] [BUILD_STARTED] Running normal-exec... from " + __dirname);

			exec.exec(CMD, function(err, stdout, stderr) {

				if (err) {
					blog.log(build_id, owner, udid, "Build start failed: " + err);
					console.log("[OID:" + owner +
						"] [BUILD_FAIL] Build start failed: " + err);
					return;
				} else {
					blog.log(build_id, owner, udid, "Running build...");
				}

				if (stderr) {
					console.log("[OID:" + owner +
						"] [BUILD_FAIL] Build start failed (stderr).");
					console.error("stderr:" + stderr);
				}
				if (stdout) {
					console.log("[BUILD] " + stdout);
				}
			});
		}
	};

	// public
	var _public = {

		build: function(owner, build, callback) {

			var build_id = uuidV1();

			var dryrun = false;
			if (typeof(build.dryrun) != "undefined") {
				dryrun = build.dryrun;
			}

			var udid = null;
			if (typeof(build.udid) !== "undefined") {
				if (build.udid === null) {
					callback(false, {
						success: false,
						status: "missing_device_udid"
					});
					return;
				}
				udid = build.udid;
			}

			if (typeof(build.source_id) === "undefined") {
				callback(false, {
					success: false,
					status: "missing_source_id"
				});
				return;
			}

			devicelib.view("devicelib", "devices_by_owner", {
				"key": owner,
				"include_docs": true
			}, function(err, body) {

				if (err) {
					if (err.toString() == "Error: missing") {
						callback(false, {
							success: false,
							status: "no_devices"
						});
					}
					console.log("/api/build: Error: " + err.toString());
					return;
				}

				var rows = body.rows; // devices returned
				var device = null;

				for (var row in rows) {
					if (!rows.hasOwnProperty(row)) continue;
					if (!rows[row].hasOwnProperty("doc")) continue;
					device = rows[row].doc;
					if (!device.hasOwnProperty("udid")) continue;
					var db_udid = device.udid;

					var device_owner;
					if (device.hasOwnProperty("owner")) {
						device_owner = device.owner;
					} else {
						device_owner = owner;
					}

					if (device_owner.indexOf(owner) !== -1) {
						if (udid.indexOf(db_udid) != -1) {
							udid = device.udid; // target device ID
							break;
						}
					}
				}

				// Converts build.git to git url by seeking in users' repos
				userlib.get(owner, function(err, doc) {

					if (err) {
						console.log(err);
						callback(false, {
							success: false,
							status: "device_fetch_error"
						});
						return;
					}

					if (typeof(doc) === "undefined") {
						callback(false, "no_such_owner", build_id);
						return;
					}

					var git = null;

					// Finds first source with given source_id
					var sources = Object.keys(doc.repos);
					for (var index in sources) {
						if (typeof(doc.repos) === "undefined") continue;
						if (!sources.hasOwnProperty(index)) continue;
						if (!doc.repos.hasOwnProperty(sources[index]))
							continue;
						var source = doc.repos[sources[index]];
						var source_id = sources[index];
						if (source_id.indexOf(build.source_id) !== -1) {
							git = source.url;
							console.log("[API-BUILD]: " + git);
							break;
						}
					}

					console.log("[API-BUILD] udid: " + udid);
					console.log(
						"[API-BUILD] owner: " +
						owner);
					console.log("[API-BUILD] git: " + git);

					if ((typeof(udid) === "undefined" || build === null) ||
						(typeof(owner) === "undefined" || owner === null) ||
						(typeof(git) === "undefined" || git === null)) {
						callback(false, {
							success: false,
							status: "invalid_params"
						});
						return;
					}

					// Tag device asynchronously with last build ID
					devicelib.destroy(device._id, device._rev, function(err) {
						if (err) {
							console.log("DATABASE CORRUPTION ISSUE!");
							console.log(err);
							return;
						}
						device.build_id = build_id;
						delete device._rev;
						devicelib.insert(device, device.udid,
							function(err, body,
								header) {
								if (err) {
									console.log(err, body);
								}
							});
					});

					if (dryrun === false) {
						callback(true, {
							success: true,
							status: "BUILDING",
							build_id: build_id
						});
					} else {
						callback(true, {
							success: true,
							status: "DRY-RUN",
							build_id: build_id
						});
					}

					_private.buildCommand(build_id, owner, git, udid, dryrun);

				});
			});
		}
	};

	return _public;

})();

exports.build = Builder.build;
