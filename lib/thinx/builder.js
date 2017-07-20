/** This THiNX-RTM API module is responsible for managing builds and should be offloadable to another server. */

var Builder = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var ROOT = app_config.project_root;

	var uuidV1 = require("uuid/v1");
	var mkdirp = require("mkdirp");
	var exec = require("child_process");

	var devicelib = require("nano")(db).use("managed_devices");
	var userlib = require("nano")(db).use("managed_users");

	var apienv = require("./apienv");
	var blog = require("./buildlog");
	var repository = require("./repository");


	// private
	var _private = {

		buildCommand: function(build_id, owner, git, udid, dryrun) {

			blog.log(build_id, owner, udid, "Build started...");

			console.log("[BUILD_STARTED] Executing build chain...");

			console.log("[BUILD] Fetching device...");
			devicelib.get(udid, function(err, device) {

				if (err) {
					return {
						success: false,
						error: "no_such_udid"
					};
				}

				// TODO: Generate the build.json file (from header)

				var build_template = require("./builder.thinx.json");

				// From `builder`

				var OWNER_ID_HOME = ROOT + "/" + "data/" + owner;
				var BUILD_PATH = OWNER_ID_HOME + "/" + udid + "/" + build_id;
				var LOG_PATH = DEPLOYMENT_PATH + "/build.log";

				//
				// Embedded Authentication
				//

				console.log("[BUILD] Fetching API Keys...");
				apikey.list(owner, function(success, json_keys) {

					if (!success) {
						callback(false, "owner_has_no_api_keys"); // using first API key by default until we'll have initial API key based on user creation.
						return;
					}

					console.log("[BUILD] Injecting last-used API Key...");
					var last_key_hash = device.lastkey;
					var api_key = null;

					if (typeof(device.keyhash) !== "undefined") {
						last_key_hash = device.keyhash;
					}

					var keys = JSON.parse(json_keys);
					for (var key in keys) {
						var kdata = keys[key];
						console.log(JSON.stringify(kdata));
						if (kdata.hash == last_key_hash) {
							api_key = kdata.key;
							console.log("Using API Key named: " + kdata.name);
							break;
						}
					}

					//
					// Create deployment path
					//

					mkdirp(BUILD_PATH, function(err) {
						if (err) {
							console.log(err);
							return {
								success: false,
								error: err
							};
						} else {

							console.log("Build path:" + BUILD_PATH + "created.");

							//
							// Fetch GIT repository
							//

							console.log("[BUILD] Pre-fetching...");

							var SHELL_FETCH = "cd " + BUILD_PATH + "; git clone " + git;
							var fetch_result = exec.execSync(SHELL_FETCH);
							console.log("Fetch result: " + fetch_result);

							// TODO: Infer platform from fetched repository

							repository.getPlatform(BUILD_PATH, function(error, platform) {

								var platform_descriptor = require("../../platforms/" +
									platform + "/descriptor.json");

								console.log("Platform: " + platform);

								var commit_id = exec.execSync("cd " + BUILD_PATH +
									"; git rev-list head --max-count=1");

								var rev_command = "git rev-list HEAD --count";
								var git_revision = exec.execSync("cd " + BUILD_PATH + "; " +
									rev_command);
								var tag_command = "git describe --abbrev=0 --tags";
								var git_tag = exec.execSync("cd " + BUILD_PATH + "; " +
									tag_command);

								if (git_tag === "") {
									git_tag = "1.0";
								}

								var REPO_VERSION = git_tag + "." + git_revision;
								console.log("REPO_VERSION: " + REPO_VERSION);

								var BUILD_DATE = new Date();

								var HEADER_FILE_NAME = platform_descriptor.header;

								var thinx_file_command = "find " + BUILD_PATH +
									" | grep '" + HEADER_FILE_NAME + "')";

								var header_file = exec.execSync(thinx_file_command);
								console.log("found header_file: " + header_file);

								if (!header_file) header_file = HEADER_FILE_NAME;

								console.log("final header_file: " + header_file);

								//
								// Fetch API Envs and create header file
								//

								apienv.list(owner,
									function(success, api_envs) {
										if (success) {

											// API Envs:
											console.log("API ENVS: " + JSON.stringify(api_envs));

											var thinx_json = require("builder.thinx.dist.json"); // use as a template

											// Import existing API ENVs
											for (var api_env in api_envs) {
												thinx_json[api_env] = api_envs[api_env];
											}

											// Attach/replace with important data
											thinx_json.THINX_ALIAS = device.alias;
											thinx_json.THINX_OWNER = device.owner;
											thinx_json.THINX_API_KEY = api_key; // inferred from last_key_hash
											thinx_json.THINX_COMMIT_ID = commit_id;
											thinx_json.THINX_FIRMWARE_VERSION_SHORT = git_tag;
											thinx_json.THINX_FIRMWARE_VERSION = git + git_tag;
											thinx_json.THINX_UDID = udid;
											thinx_json.THINX_APP_VERSION = git_tag;

											thinx_json.THINX_CLOUD_URL = app_config.base_url;
											thinx_json.THINX_MQTT_URL = app_config.mqtt_server;
											thinx_json.THINX_AUTO_UPDATE = true; // device.autoUptate
											thinx_json.THINX_MQTT_PORT = app_config.mqtt_port;
											thinx_json.THINX_API_PORT = app_config.secure_port;
											thinx_json.THINX_PROXY = "thinx.local";
											thinx_json.THINX_PLATFORM = platform;

											fs.writeFile(BUILD_PATH + "/thinx_build.json", JSON.stringify(
												thinx_json), function(err) {
												if (err) {
													return console.log(err);
												} else {

													console.log("The thinx_build.json file was saved!");

													console.log("[BUILD] Generating headers...");

													var PRE = "cd " + ROOT + "; " + ROOT +
														"/pre-builder --json=" + BUILD_PATH +
														"/thinx_build.json --workdir=" + BUILD_PATH +
														" --root=" + ROOT;

													var presult = exec.execSync(PRE);
													console.log(presult);

													console.log("[BUILD] Build...");

													var CMD = "cd " + ROOT + ";" + ROOT +
														"/builder --owner=" + owner +
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



													apienv.list(owner, function(success, keys) {

														if (!success) {
															console.log(
																"Custom Environment Variables not loaded.");
														} else {
															var stringVars = JSON.stringify(keys);
															console.log(
																"Build with Custom Environment Variables: " +
																stringVars);
															CMD = CMD + " --env=" + stringVars;
														}

														var shell = exec.spawn(CMD, {
															shell: true
														});

														console.log("[OID:" + owner +
															"] [BUILD_STARTED] Running normal-exec... from " +
															__dirname);

														shell.stdout.on("data", function(data) {
															// console.log("[THiNX-BUILD][LOG]" + data.toString());
														});

														shell.stderr.on("data", function(data) {
															console.log("[THiNX-BUILD][ERR]" + data.toString());
														});

														shell.on("exit", function(code) {
															console.log("[OID:" + owner +
																"] [BUILD_COMPLETED] with code " +
																code
															);
														});

													});
												}
											});
										} else {
											console.log("[APIEnv] Listing failed:" +
												object);
										}
									});
							});
						}
					});
				});
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

					console.log("[API-BUILD] build_id: " + build_id);
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
