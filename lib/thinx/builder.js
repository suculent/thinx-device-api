/** This THiNX-RTM API module is responsible for managing builds and should be offloadable to another server. */

var Builder = (function() {

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var db = app_config.database_uri;
	var ROOT = app_config.project_root;

	var uuidV1 = require("uuid/v1");
	var mkdirp = require("mkdirp");
	var exec = require("child_process");
	var fs = require("fs");
	var path = require("path");
	var finder = require("fs-finder");

	var prefix = "";
	try {
		var pfx_path = app_config.project_root + '/conf/.thx_prefix';
		if (fs.existsSync(pfx_path)) {
			prefix = fs.readFileSync(pfx_path) + "_";
		}
	} catch (e) {
		//console.log(e);
	}

	var devicelib = require("nano")(db).use(prefix + "managed_devices");
	var userlib = require("nano")(db).use(prefix + "managed_users");

	var apienv = require("./apienv");
	var blog = require("./buildlog");
	var repository = require("./repository");
	var apikey = require("./apikey");
	var v = require("./version");

	var thinx_json_template = require("../../builder.thinx.dist.json");

	// private
	var _private = {

		buildCommand: function(build_id, owner, git, udid, dryrun) {

			// Guards (early exit on invalid parameters)

			if (typeof(owner) === "undefined") {
				console.log("owner is undefined, exiting!");
				return false;
			}

			if (typeof(git) === "undefined") {
				console.log("git is undefined, exiting!");
				return false;
			}

			// Log build start

			blog.log(build_id, owner, udid, "Build started...");

			blog.state(build_id, owner, udid, "started");

			console.log("[builder] [BUILD_STARTED] Executing build chain...");
			console.log("[builder] Fetching device " + udid + " for owner " + owner);

			// Fetch device info

			devicelib.get(udid, function(err, device) {

				if (err) {
					return {
						success: false,
						error: "no_such_udid"
					};
				}

				var build_template = require("../../builder.thinx.json");

				// From `builder`

				var OWNER_ID_HOME = ROOT + "/" + "data/" + owner;
				var BUILD_PATH = OWNER_ID_HOME + "/" + udid + "/" + build_id;
				var LOG_PATH = BUILD_PATH + "/build.log";

				//
				// Embed Authentication
				//

				console.log("[builder] Fetching API Keys...");

				apikey.list(owner, function(success, json_keys) {

					if (!success) {
						console.log("API Key list failed. " + json_keys);
						if (typeof(callback) !== "undefined") {
							callback(false, "owner_has_no_api_keys"); // using first API key by default until we'll have initial API key based on user creation.
						}
						blog.state(build_id, owner, udid, "failed");
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
							console.log("[builder] Injecting API Key with hash: " + kdata.hash);
							break;
						}
					}

					//
					// Create deployment path
					//

					mkdirp(BUILD_PATH, function(err) {
						if (err) {
							console.log("[builder] " + err);
							blog.state(build_id, owner, udid, "failed");
							return {
								success: false,
								error: err
							};
						} else {

							console.log("[builder] Build path:" + BUILD_PATH + " created.");

							//
							// Fetch GIT repository
							//

							console.log("[builder] Pre-fetching " + git + "...");

							var SHELL_FETCH = "cd " + BUILD_PATH + "; git clone " + git +
								"; cd * ; git submodule update --init --recursive";
							var fetch_result = exec.execSync(SHELL_FETCH);
							console.log("[builder] Builder GIT Fetch result: " +
								fetch_result);

							var directories = fs.readdirSync(BUILD_PATH).filter(
								file => fs.lstatSync(path.join(BUILD_PATH, file)).isDirectory()
							);

							console.log("Directories: " + JSON.stringify(directories));

							// Adjust build path
							var XBUILD_PATH = BUILD_PATH + "/" + directories[0];

							if (directories.length > 1) {
								XBUILD_PATH = BUILD_PATH + "/" + directories[1]; // 1 is always git
							}

							if (directories.length == 1) {
								XBUILD_PATH = BUILD_PATH + "/" + directories[0];
							}

							console.log("XBUILD_PATH: " + XBUILD_PATH);

							repository.getPlatform(XBUILD_PATH, function(success, platform) {

								if (!success) {
									console.log("[builder] failed on unknown platform" +
										platform);
									blog.state(build_id, owner, udid, "failed");
									return;
								}

								var platform_descriptor = require("../../platforms/" +
									platform + "/descriptor.json");

								console.log("[builder] Platform: " + platform);

								var commit_id = exec.execSync("cd " + XBUILD_PATH +
									"; git rev-list --all --max-count=1").toString();

								var rev_command = "git rev-list --all --count";
								var git_revision = exec.execSync("cd " + XBUILD_PATH + "; " +
									rev_command).toString();

								console.log("[builder] Trying to fetch GIT tag...");

								// --> Safe version of the pattern, should be extracted as fn.
								var git_tag = null;
								var tag_command = "git describe --abbrev=0 --tags";
								try {
									git_tag = exec.execSync("cd " + XBUILD_PATH + "; " +
										tag_command).toString();
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

								var REPO_VERSION = (git_tag + "." + git_revision).replace("\n", "");
								var BUILD_DATE = new Date();
								var HEADER_FILE_NAME = platform_descriptor.header;

								console.log("[builder] REPO_VERSION (TAG+REV) [unused var]: '" + REPO_VERSION.replace(
									"\n", "") + "'");

								var header_file = null;
								try {
									console.log("Finding " + HEADER_FILE_NAME + " in " +
										XBUILD_PATH);
									var h_file = finder.from(XBUILD_PATH).findFiles(
										HEADER_FILE_NAME);
									if ((typeof(h_file) !== "undefined") && h_file !== null) {
										header_file = h_file[0];
									}
									console.log("[builder] found header_file: " + header_file);
								} catch (e) {
									console.log(
										"TODO: FAIL HERE: Exception while getting header file, use FINDER instead!: " +
										e);
								}

								if (header_file === null) {
									header_file = XBUILD_PATH / HEADER_FILE_NAME;
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
											thinx_json.THINX_APP_VERSION = v.revision();

											thinx_json.THINX_CLOUD_URL = app_config.base_url;
											thinx_json.THINX_MQTT_URL = app_config.mqtt_server;
											thinx_json.THINX_AUTO_UPDATE = true; // device.autoUptate
											thinx_json.THINX_MQTT_PORT = app_config.mqtt_port;
											thinx_json.THINX_API_PORT = app_config.secure_port;
											thinx_json.THINX_PROXY = "thinx.local";
											thinx_json.THINX_PLATFORM = platform;
											thinx_json.THINX_AUTO_UPDATE = device.auto_update;

											fs.writeFile(XBUILD_PATH + "/thinx_build.json", JSON.stringify(
												thinx_json), function(err) {
												if (err) {
													blog.state(build_id, owner, udid, "failed");
													return console.log("[builder] " + err);
												}

												console.log(
													"[builder] Calling pre-builder to generate headers from thinx_build.json..."
												);

												if (XBUILD_PATH.indexOf("undefined") !== -1) {
													return console.log("XBUILD_PATH_ERROR:" +
														XBUILD_PATH);
												}

												var PRE = "cd " + ROOT + "; " + ROOT +
													"/pre-builder --json=" + XBUILD_PATH +
													"/thinx_build.json --workdir=" + XBUILD_PATH +
													" --root=" + ROOT;

												console.log("Pre-building with command: " + PRE);

												try {
													var presult = exec.execSync(PRE);
													console.log("[builder] Pre-build result: " +
														presult.toString());
												} catch (e) {
													console.log(e);
												}

												console.log(
													"[builder] Starting build environment...");

												var CMD = "cd " + ROOT + ";" + ROOT +
													"/builder --owner=" + owner +
													" --udid=" + udid +
													" --git=" +
													git + " --id=" + build_id + " --workdir=" +
													XBUILD_PATH;

												if (dryrun === true) {
													CMD = CMD + " --dry-run";
												}

												if (udid === null) {
													console.log("[builder] Cannot build without udid!");
													blog.state(build_id, owner, udid, "failed");
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

													console.log("[builder] Building in shell: " + CMD);

													var shell = exec.spawn(CMD, {
														shell: true
													});

													console.log("[OID:" + owner +
														"] [BUILD_STARTED] Running normal-exec... from " +
														__dirname);

													shell.stdout.on("data", function(data) {
														console.log("[OID:" + owner + "] [builder] [LOG] [STDOUT] " +
															data.toString());
													});

													shell.stderr.on("data", function(data) {
														console.log("[STDERR] " + data);
													});

													shell.on("exit", function(code) {
														console.log("[OID:" + owner +
															"] [BUILD_COMPLETED] [builder] with code " +
															code
														);
														if (code > 0) {
															blog.state(build_id, owner, udid, "fail");
														} else {
															blog.state(build_id, owner, udid, "success");
														}
													});

												});

											});
										} else {
											console.log("[builder] [APIEnv] Listing failed:" +
												owner);
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
			var udid;

			var dryrun = false;
			if (typeof(build.dryrun) !== "undefined") {
				dryrun = build.dryrun;
			}

			if (typeof(build.udid) !== "undefined") {
				if (build.udid === null) {
					callback(false, {
						success: false,
						status: "missing_device_udid"
					});
					return;
				}
				udid = build.udid;
			} else {
				console.log("NOT Assigning empty build.udid! " + build.udid);
			}

			if (typeof(build.source_id) === "undefined") {
				callback(false, {
					success: false,
					status: "missing_source_id"
				});
				return;
			}

			if (typeof(owner) === "undefined") {
				callback(false, {
					success: false,
					status: "missing_owner"
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
					//if (!rows.hasOwnProperty(row)) continue;
					//if (!rows[row].hasOwnProperty("doc")) continue;
					device = rows[row].doc;
					if (!device.hasOwnProperty("udid")) continue;
					var db_udid = device.udid;

					var device_owner = "";
					if (typeof(device.owner) !== "undefined") {
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

				console.log("Building for device: " + JSON.stringify(device));

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

					console.log("[builder] searching: " + doc.repos + " in: " + JSON.stringify(sources));

					for (var index in sources) {
						//if (typeof(doc.repos) === "undefined") continue;
						//if (!sources.hasOwnProperty(index)) continue;
						//if (!doc.repos.hasOwnProperty(sources[index])) continue;
						var source = doc.repos[sources[index]];
						var source_id = sources[index];
						if (typeof(source_id) === "undefined") {
							console.log("[builder] source_id undefined: " + source_id);
							continue;
						}
						if (source_id.indexOf(build.source_id) !== -1) {
							git = source.url;
							console.log("[builder] git found: " + git);
							break;
						}
					}

					if ((typeof(udid) === "undefined" || build === null) ||
						(typeof(owner) === "undefined" || owner === null || owner === "") ||
						(typeof(git) === "undefined" || git === null || git === "")) {
						callback(false, {
							success: false,
							status: "invalid_params"
						});
						return;
					}

					console.log("[builder] build_id: " + build_id);
					console.log("[builder] udid: " + udid);
					console.log(
						"[builder] owner: " +
						owner);
					console.log("[builder] git: " + git);

					// Tag device asynchronously with last build ID
					//devicelib.destroy(device._id, device._rev, function(err) {

					/*
					if (err) {
						console.log("[builder] DATABASE CORRUPTION ISSUE!");
						console.log(err);
						return;
					}*/

					device.build_id = build_id;
					delete device._rev;
					delete device._id;

					console.log("Build atomically updating device with " + JSON.stringify(device));

					devicelib.atomic("devicelib", "modify", device.udid, device, function(error, body) {
						if (error) {
							console.log(error);
							devicelib.insert(device, device.udid,
								function(err, body,
									header) {
									if (err) {
										console.log("[builder] " + err, body);
									}
								});
						}
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
			//console.log("Supported languages: " + JSON.stringify(languages));
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
			return extensions;
		}

	};

	return _public;

})();

exports.build = Builder.build;
exports.supportedLanguages = Builder.supportedLanguages;
exports.supportedExtensions = Builder.supportedExtensions;
