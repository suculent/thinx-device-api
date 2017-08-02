/** This THiNX-RTM API module is responsible for managing builds and should be offloadable to another server. */

var Builder = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var ROOT = app_config.project_root;

	var uuidV1 = require("uuid/v1");
	var mkdirp = require("mkdirp");
	var exec = require("child_process");
	var fs = require("fs");
	var path = require("path");

	var prefix = "";
	try {
		prefix = fs.readFileSync(app_config.project_root + '/conf/.thx_prefix');
		prefix = prefix + "_";
	} catch (e) {
		console.log(e);
	}
	var devicelib = require("nano")(db).use(prefix + "managed_devices");
	var userlib = require("nano")(db).use(prefix + "managed_users");

	var apienv = require("./apienv");
	var blog = require("./buildlog");
	var repository = require("./repository");
	var apikey = require("./apikey");

	var thinx_json_template = require("../../builder.thinx.dist.json");

	// private
	var _private = {

		buildCommand: function(build_id, owner, git, udid, dryrun) {

			blog.log(build_id, owner, udid, "Build started...");

			console.log("[builder] [BUILD_STARTED] Executing build chain...");

			console.log("[builder] Fetching device " + udid + " for owner " + owner);

			devicelib.get(udid, function(err, device) {

				if (err) {
					console.log("Device fetch failed, retrying...: " + err);

					_private.buildCommand(build_id, owner, git, udid, dryrun);

					/* return {
						success: false,
						error: "no_such_udid"
					}; */

					// TODO: PREVENT LOOP HERE!
					return;
				}

				var build_template = require("../../builder.thinx.json");

				// From `builder`

				var OWNER_ID_HOME = ROOT + "/" + "data/" + owner;
				var BUILD_PATH = OWNER_ID_HOME + "/" + udid + "/" + build_id;
				var LOG_PATH = BUILD_PATH + "/build.log";

				//
				// Embedded Authentication
				//

				console.log("[builder] Fetching API Keys...");

				apikey.list(owner, function(success, json_keys) {

					if (!success) {
						console.log("API Key list failed. " + json_keys);
						callback(false, "owner_has_no_api_keys"); // using first API key by default until we'll have initial API key based on user creation.
						return;
					}


					var last_key_hash = null;
					var api_key = null;

					// deprecated
					if (typeof(device.keyhash) !== "undefined") {
						last_key_hash = device.keyhash;
					}

					if (typeof(device.lastkey) !== "undefined") {
						last_key_hash = device.lastkey;
					}

					for (var key in json_keys) {
						var kdata = json_keys[key];
						if (kdata.hash == last_key_hash) {
							api_key = kdata.key;
							console.log("[builder] Injecting API Key: " + kdata.hash);
							break;
						}
					}

					//
					// Create deployment path
					//

					mkdirp(BUILD_PATH, function(err) {
						if (err) {
							console.log("[builder] " + err);
							return {
								success: false,
								error: err
							};
						} else {

							console.log("[builder] Build path:" + BUILD_PATH + " created.");

							//
							// Fetch GIT repository
							//

							console.log("[builder] Pre-fetching...");

							var SHELL_FETCH = "cd " + BUILD_PATH + "; git clone " + git;
							var fetch_result = exec.execSync(SHELL_FETCH);
							console.log("[builder] Builder GIT Fetch result: " +
								fetch_result);

							var directories = fs.readdirSync(BUILD_PATH).filter(
								file => fs.lstatSync(path.join(BUILD_PATH, file)).isDirectory()
							);

							BUILD_PATH = BUILD_PATH + "/" + directories[0];

							repository.getPlatform(BUILD_PATH, function(success, platform) {

								if (!success) {
									console.log("[builder] " + error, platform);
									return;
								}

								var platform_descriptor = require("../../platforms/" +
									platform + "/descriptor.json");

								console.log("[builder] Platform: " + platform);

								var commit_id = exec.execSync("cd " + BUILD_PATH +
									"; git rev-list --all --max-count=1");

								var rev_command = "git rev-list --all --count";
								var git_revision = exec.execSync("cd " + BUILD_PATH + "; " +
									rev_command);

								console.log("[builder] Trying to fetch GIT tag...");

								// --> Safe version of the pattern, should be extracted as fn.
								var git_tag = null;
								var tag_command = "git describe --abbrev=0 --tags";
								try {
									git_tag = exec.execSync("cd " + BUILD_PATH + "; " +
										tag_command);
								} catch (e) {
									console.log(
										"[builder] TODO: HIDE THIS: Exception while getting git tag: " +
										e
									);
									git_tag = "1.0";
								}
								if (git_tag === null) {
									git_tag = "1.0";
								}
								// <--

								var REPO_VERSION = git_tag + "." + git_revision;
								var BUILD_DATE = new Date();
								var HEADER_FILE_NAME = platform_descriptor.header;

								console.log("[builder] REPO_VERSION (TAG+REV): " +
									REPO_VERSION);

								var thinx_file_command = "find " + BUILD_PATH +
									" | grep '" + HEADER_FILE_NAME + "'";

								var header_file = null;
								try {
									header_file = exec.execSync(thinx_file_command);
									console.log("[builder] found header_file: " + header_file);
								} catch (e) {
									console.log(
										"TODO: FAIL HERE: Exception while getting header file: " +
										e);
								}

								if (header_file === null) {
									header_file = BUILD_PATH / HEADER_FILE_NAME;
									console.log("header_file empty, assigning path: " +
										header_file);
								}

								console.log("[builder] Final header_file: " + header_file);

								//
								// Fetch API Envs and create header file
								//

								apienv.list(owner,
									function(success, api_envs) {
										if (success) {

											var thinx_json = thinx_json_template;

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
											thinx_json.THINX_AUTO_UPDATE = device.auto_update;

											fs.writeFile(BUILD_PATH + "/thinx_build.json", JSON.stringify(
												thinx_json), function(err) {
												if (err) {
													return console.log("[builder] " + err);
												} else {

													console.log(
														"[builder] Calling pre-builder to generate headers from thinx_build.json..."
													);

													var PRE = "cd " + ROOT + "; " + ROOT +
														"/pre-builder --json=" + BUILD_PATH +
														"/thinx_build.json --workdir=" + BUILD_PATH +
														" --root=" + ROOT;

													console.log(PRE);
													var presult = exec.execSync(PRE);
													console.log("[builder] Pre-build result: " + JSON.stringify(
														presult));

													console.log(
														"[builder] Starting build environment...");

													var CMD = "cd " + ROOT + ";" + ROOT +
														"/builder --owner=" + owner +
														" --udid=" + udid +
														" --git=" +
														git + " --id=" + build_id;

													if (dryrun === true) {
														CMD = CMD + " --dry-run";
													}

													if (udid === null) {
														console.log("[builder] Cannot build without udid!");
														return;
													}

													apienv.list(owner, function(success, keys) {

														if (!success) {
															console.log(
																"[builder] Custom Environment Variables not loaded."
															);
														} else {
															var stringVars = JSON.stringify(keys);
															console.log(
																"[builder] Build with Custom Environment Variables: " +
																stringVars);
															CMD = CMD + " --env=" + stringVars;
														}

														console.log("[builder] command:" + CMD);

														var shell = exec.spawn(CMD, {
															shell: true
														});

														console.log("[OID:" + owner +
															"] [BUILD_STARTED] Running normal-exec... from " +
															__dirname);

														shell.stdout.on("data", function(data) {
															console.log("[builder] [LOG]" + data.toString());
														});

														shell.stderr.on("data", function(data) {
															console.log("[builder] [THiNX-BUILD][ERR]" +
																data.toString());
														});

														shell.on("exit", function(code) {
															console.log("[OID:" + owner +
																"] [BUILD_COMPLETED] [builder] with code " +
																code
															);
														});

													});
												}
											});
										} else {
											console.log("[builder] [APIEnv] Listing failed:" +
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
					console.log("[builder] /api/build: Error: " + err.toString());
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
						console.log("[builder] " + err);
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
							console.log("[builder]: " + git);
							break;
						}
					}

					console.log("[builder] build_id: " + build_id);
					console.log("[builder] udid: " + udid);
					console.log(
						"[builder] owner: " +
						owner);
					console.log("[builder] git: " + git);

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
							console.log("[builder] DATABASE CORRUPTION ISSUE!");
							console.log(err);
							return;
						}
						device.build_id = build_id;
						delete device._rev;
						devicelib.insert(device, device.udid,
							function(err, body,
								header) {
								if (err) {
									console.log("[builder] " + err, body);
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
		},

		supportedLanguages: function() {
			var languages_path = app_config.project_root + "/languages";
			var languages = fs.readdirSync(languages_path).filter(
				file => fs.lstatSync(path.join(languages_path, file)).isDirectory()
			);
			console.log("Supported languages: " + JSON.stringify(languages));
			return languages;
		},

		supportedExtensions: function() {
			var languages_path = app_config.project_root + "/languages";
			var languages = _public.supportedLanguages();
			var extensions = [];
			for (var lindex in languages) {
				var dpath = languages_path + "/" + languages[lindex] +
					"/descriptor.json";
				var descriptor = require(dpath);
				if (typeof(descriptor) !== "undefined") {
					var xts = descriptor.extensions;
					for (var eindex in xts) {
						extensions.push(xts[eindex]);
					}
				} else {
					console.log("No Language descriptor found at " + dpath);
				}
			}
			return supported_extensions;
		}

	};

	return _public;

})();

exports.build = Builder.build;
exports.supportedLanguages = Builder.supportedLanguages;
exports.supportedExtensions = Builder.supportedExtensions;
