/** This THiNX-RTM API module is responsible for managing builds and should be offloadable to another server. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var db = app_config.database_uri;
var ROOT = app_config.project_root;

const uuidV1 = require("uuid/v1");
const mkdirp = require("mkdirp");
const exec = require("child_process");
const fs = require("fs");
const path = require("path");
const finder = require("fs-finder");
const sha256 = require("sha256");
const YAML = require('yaml');

var devicelib = require("nano")(db).use(prefix + "managed_devices");
var userlib = require("nano")(db).use(prefix + "managed_users");

var APIEnv = require("./apienv"); var apienv = new APIEnv();
var BuildLog = require("./buildlog"); var blog = new BuildLog();
var Repository = require("./repository"); var repository = new Repository();
var ApiKey = require("./apikey"); var apikey = new ApiKey();
var Version = require("./version"); var v = new Version();
var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
var RSAKey = require("./rsakey"); var rsakey = new RSAKey();

module.exports = class Builder {

	wsError(websocket, message) {
		if (typeof(this.websocket) !== "undefined" && this.websocket !== null) {
			try {
				websocket.send(JSON.stringify({notification: message}));
			} catch (e) {
				console.log(e);
			}
		}
	}

	buildGuards(callback, owner, git, branch) {
		if (typeof(owner) === "undefined") {
			console.log("owner is undefined, exiting!");
			if (typeof(callback) !== "undefined") {
				callback(false, "owner undefined");
			}
			return false;
		}

		if (typeof(git) === "undefined") {
			console.log("git is undefined, exiting!");
			if ((typeof(callback) !== "undefined") && (callback !== null)) {
				callback(false, "git undefined");
			}
			return false;
		}

		if (typeof(branch) === "undefined") {
			console.log("branch is undefined, exiting!");
			if ((typeof(callback) !== "undefined") && (callback !== null)) {
				callback(false, "branch undefined");
			}
			return false;
		}
		return true;
	}

	buildStatusNotification(message, successString, udid) {
		return {
				notification: {
					title: "Build Status",
					body: message.toString(),
					type: successString,
					udid: udid
				}
		};
	}

	sendNotificationIfSocketAlive(websocket, notification) {
		if (typeof(websocket) !== "undefined" && websocket !== null) {
			try {
				if (websocket.isAlive) {
					websocket.send(JSON.stringify(notification), function ack(error) {
						if (typeof(error) !== "undefined") {
							console.log("builder websocket error: "+error);
						}
					});
				} else {
					console.log("Skipping dead websocket notification.");
				}
			} catch (e) {
				console.log("[builder] ws_send_exception" + e);
			}
		} else {
			console.log("[notify] No websocket."); // debug only
		}
	}

	successStringFromBool(success) {
		var successString;
		if (success) {
			successString = "success"; // green
		} else {
			successString = "failed"; // orange
		}
		return successString;
	}

	// Used to sends a build status notification using websocket
	notify(udid, notifiers, message, success) {
		var status = this.successStringFromBool(success);
		if (message.indexOf("build_running") !== -1) {
			status = "info"; // blue
		}
		this.sendNotificationIfSocketAlive(
			notifiers.websocket,
			this.buildStatusNotification(message, status, udid)
		);
	}

	getLastAPIKey(owner, udid, callback) {
		console.log("[builder] Fetching API Keys for owner "+owner);
		apikey.list(owner, (success, json_keys) => {
			if (!success) {
				console.log("API Key list failed. " + json_keys);
				callback(false, "owner_has_no_api_keys");
				// using first API key by default until we'll have initial API key based on user creation.
				//this.notify(udid, notifiers, "error_api_key_list_failed", false);
				//blog.state(build_id, owner, udid, "failed");
				return;
			}
			var last_key_hash = null;
			var api_key = null;

			// There is no device object known in this method
			//if (typeof(device.lastkey) !== "undefined") {
			//	last_key_hash = device.lastkey;
			//}

			for (var key in json_keys) {
				var kdata = json_keys[key];
				// console.log("kdata: " + JSON.stringify(kdata));
				if ((typeof(kdata) !== "undefined") && (kdata !== null)) {
					if (sha256(kdata.hash) == last_key_hash) {
						api_key = kdata.name;
						break;
					} else {
						api_key = kdata.name; // pick valid key automatically if not the selected one
					}
				}
			}
			if (api_key === null) {
				console.log("Build requires API Key result.");
				callback(false, "build_requires_api_key");
				return;
			}
			callback(true, api_key);
		});
	}

	runShell(CMD, owner, build_id, udid, notifiers) {

		var shell = exec.spawn(CMD, { shell: true });

		console.log("[OID:" + owner + "] [BUILD_STARTED] EXEC from " + __dirname);

		shell.stdout.on("data", (data) => {
			var string = data.toString();
			var logline = string;
			if (logline.substr(logline.count - 3, 1) === "\n\n") {
				logline = string.substr(0, string.count - 2); // cut trailing newline
			}
			if (logline !== "\n") {
				console.log("[builder] [STDOUT] " + logline);
			}
		}); // end shell on out data

		shell.stderr.on("data", (data) => {
			var dstring = data.toString();
			console.log("[STDERR] " + data);
			if (dstring.indexOf("fatal:") !== -1) {
				blog.state(build_id, owner, udid, "failed");
			}
		}); // end shell on error data

		shell.on("exit", (code) => {
			console.log("[OID:" + owner + "] [BUILD_COMPLETED] [builder] with code " + code);
			if (code > 0) {
				this.notify(udid, notifiers, "build_failed", false);
				blog.state(build_id, owner, udid, "failed");
				this.wsError(notifiers.websocket, "Build failed.");
			} else {
				this.notify(udid, notifiers, "build_completed", true);
				blog.state(build_id, owner, udid, "success");
				this.wsError(notifiers.websocket, "Build successful.");
			}
		}); // end shell on exit
	}

	containsNullOrUndefined(array) {
		for (var index in array) {
			const item = array[index];
			if (typeof(item) === "undefined") return false;
			if (item === null) return false;
			if (item.length === 0) return false;
		}
		return true;
	}

	run_build(build_id, owner, git, branch, udid, dryrun, notifiers, callback) {

		if (!this.buildGuards(callback, owner, git, branch)) return;

		blog.log(build_id, owner, udid, "Build started..."); // may take time to save

		console.log("[builder] [BUILD_STARTED] Executing build chain...");
		console.log("[builder] Fetching device " + udid + " for owner " + owner);

		// Fetch device info
		devicelib.get(udid, (err, device) => {

			if (err) {
				callback(false, "no_such_udid");
				return;
			}

			var BUILD_PATH = app_config.data_root + app_config.build_root + "/" + owner + "/" + udid + "/" + build_id;

			// Embed Authentication
			this.getLastAPIKey(owner, udid, (success, api_key) => {

				if (api_key === null) {
					console.log("Build requires API Key.");
					callback(false, "build_requires_api_key");
					blog.state(build_id, owner, device.udid, "failed-no_api_key");
					return;
				}

				if (!success) return;

				//
				// Create deployment path
				//

				var mkresult = mkdirp.sync(BUILD_PATH, (err) =>  {
					if (err) {
						console.log("[builder] " + err);
						this.notify(udid, notifiers, "error_io_failed", false);
						blog.state(build_id, owner, udid, "failed");
						callback(false, err);
					}
				});

				if (!mkresult) {
					console.log("mkdirp.sync failed");
				}


				this.notify(udid, notifiers, "fetching_git", true);

				const state = {
					build_id: build_id,
					owner: owner,
					udid: udid,
					state: "started"
				};

				console.log("Loggin state: "+JSON.stringify(state, false, 2));
				blog.state(build_id, owner, udid, "started");

				console.log("[builder] Build path:" + BUILD_PATH + " created.");

				//
				// Fetch GIT repository
				//

				if (typeof(branch) === "undefined") {
					branch = "origin/master";
				}

				var sanitized_branch = sanitka.branch(branch);
				var sanitized_url = sanitka.url(git);

				console.log("[builder] Pre-fetching " + git + " to " + BUILD_PATH + "...");

				var SHELL_FETCH = "cd " + BUILD_PATH + "; if $(git clone " + sanitized_url +
					" -b " + sanitized_branch + "); then cd *; git pull origin " + sanitized_branch + " --recurse-submodules; fi";

				let result;
				try {
					console.log("Running command "+SHELL_FETCH);
					result = exec.execSync(SHELL_FETCH).toString().replace("\n", "");
				} catch (e) {
					console.log("[builder] git_fetch_exception " + e);
					// do not exit, will try again with private keys...
				}

				// try to solve access rights issue by using owner keys...
				var git_success = fs.existsSync(BUILD_PATH + "/*");

				console.log("Initial prefetch successful? : " + git_success);
				if ( git_success == false || git_success == [] ) {

					console.log("Searching for SSH keys...");

					const key_paths = rsakey.getKeyPathsForOwner(owner);
					console.log({ key_paths });

					if (key_paths.count < 1) {
						console.log("Build requires RSA Key.");
						callback(false, "no_rsa_key_found");
						blog.state(build_id, owner, udid, "no_rsa_key_found");
						return;
					}

					console.log("No problem for builder, re-try using SSH keys...");

					// TODO: FIXME: same pattern is in device.attach() and sources.add()
					for (var kindex in key_paths) {
						// TODO: skip non-owner keys
						//var prefix = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
						var prefix = "cp " + app_config.ssh_keys + "/" + key_paths[kindex] + " ~/.ssh/id_rsa; "; // needs cleanup after build to prevent stealing code!
						   prefix += "cp " + app_config.ssh_keys + "/" + key_paths[kindex] + ".pub ~/.ssh/id_rsa.pub; bash -c '";

						try {
							var GIT_FETCH = prefix + SHELL_FETCH + "'";
							console.log("GIT_FETCH: " + GIT_FETCH);
							result = exec.execSync(GIT_FETCH).toString().replace("\n", "");
							console.log("[builder] git rsa clone result: " + result);
							break;
						} catch (e) {
							console.log("git rsa clone error (cleaning up...): "+e);
							var RSA_CLEAN = "rm -rf ~/.ssh/id_rsa && rm -rf ~/.ssh/id_rsa.pub";
							exec.execSync(RSA_CLEAN);
							callback(false, "git_fetch_failed_private");
							blog.state(build_id, owner, udid, "git_fetch_failed_private");
							return;
						}
					}
				} else {
					console.log("[builder] GIT Fetch Result: " + git_success);
				}

				var files = fs.readdirSync(BUILD_PATH);
				console.log("[builder] Fetched project Files: " + JSON.stringify(files));

				var directories = fs.readdirSync(BUILD_PATH).filter(
					file => fs.lstatSync(path.join(BUILD_PATH, file)).isDirectory()
				);
				console.log("[builder] Fetched project Directories: " + JSON.stringify(directories));

				if ((files.length == 0) && (directories.length == 0)) {
					callback(false, "git_fetch_failed_private");
					blog.state(build_id, owner, udid, "git_fetch_failed_private");
					return;
				}

				// Adjust XBUILD_PATH (build path incl. inferred project folder, should be one.)
				var XBUILD_PATH = BUILD_PATH;

				if (directories.length > 1) {
					XBUILD_PATH = BUILD_PATH + "/" + directories[1]; // 1 is always git
					console.log("[builder] ERROR, TOO MANY DIRECTORIES!");
				}

				if (directories.length === 1) {
					XBUILD_PATH = BUILD_PATH + "/" + directories[0];
				}

				console.log("[builder] XBUILD_PATH: " + XBUILD_PATH);

				repository.getPlatform(XBUILD_PATH, (success, platform) => {

					if (!success) {
						console.log("[builder] failed on unknown platform" +
							platform);
						this.notify(udid, notifiers, "error_platform_unknown", false);
						blog.state(build_id, owner, udid, "failed");
						callback(false, "unknown platform: " + platform);
						return;
					}

					// feature/fix ->
					//
					// Verify firmware vs. device MCU compatibility (based on thinx.yml compiler definitions)
					//

					platform = device.platform;

					var platform_array = platform.split(":");
					var device_platform = platform_array[0]; // should work even without delimiter
					var device_mcu = platform_array[1];

					const yml_path = XBUILD_PATH + "/thinx.yml";
					const isYAML = fs.existsSync(yml_path);

					var y_platform = device_platform;

					if (isYAML) {
						const y_file = fs.readFileSync(yml_path, 'utf8');
						const yml = YAML.parse(y_file);

						if (typeof(yml) !== "undefined") {
							console.log("[builder] Parsed YAML: "+JSON.stringify(yml));
							// This takes first key. It could be possible to have more keys (array allows same names)
							// and find the one with closest platform.
							y_platform = Object.keys(yml)[0];
							console.log("[builder] YAML-based platform: " + y_platform);
							const y_mcu = yml[y_platform].arch;
							if (y_mcu.indexOf(device_mcu) == -1) {
								const message = "[builder] MCU defined by thinx.yml (" + y_mcu + ") not compatible with this device MCU: " + device_mcu;
								console.log(message);
								blog.state(build_id, owner, udid, message);
								callback(false, message);
								return;
							} else {
								console.log("[builder] MCU is compatible.");
							}

							/* Store platform + architecture if possible (o'rly?... we need y_platform later. REFACTOR)
							if ( (typeof(yml.arduino) !== "undefined") &&
									 (typeof(yml.arduino.arch) !== "undefined") ) {
										 device_platform = y_platform + ":" + yml.arduino.arch;
							}*/
						}
					} else {
						console.log("[builder] BuildCommand-Detected platform (no YAML at " + yml_path + "): " + platform);
					}

					// <- platform_descriptor needs header (maybe only, that's OK)

					var d_filename = app_config.project_root + "/platforms/" +
						y_platform + "/descriptor.json";

					if (!fs.existsSync(d_filename)) {
						console.log("[builder] no descriptor found at "+d_filename);
						blog.state(build_id, owner, udid, "builder not found");
						callback(false, "builder not found for platform in: " + d_filename);
						return;
					}

					var platform_descriptor = require(d_filename);
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

					var REPO_VERSION = (git_tag + "." + git_revision).replace(/\n/g, "");
					var HEADER_FILE_NAME = platform_descriptor.header;

					console.log("[builder] REPO_VERSION (TAG+REV) [unused var]: '" + REPO_VERSION.replace(/\n/g, "") + "'");

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
							"TODO: FAIL HERE: Exception while getting header file, use FINDER instead!: " + e);
							blog.state(build_id, owner, udid, "thinx.h not found");
					}

					if (header_file === null) {
						header_file = XBUILD_PATH / HEADER_FILE_NAME;
						console.log("header_file empty, assigning path: " +
							header_file);
					}

					console.log("[builder] Final header_file: " + header_file);

					var REPO_NAME = XBUILD_PATH.replace(/^.*[\\\/]/, '').replace(".git", "");

					//
					// Fetch API Envs and create header file
					//

					console.log("[builder] Listing ENVs...");

					apienv.list(owner, (success, api_envs) => {

						console.log("[builder] Fetched ENVs...");

						if (!success) {
							console.log("[builder] [APIEnv] Listing failed:" + owner);
							// must not be blocking
						}

						console.log("[builder] Preparing build template...");

						// --> extract from here
						var thinx_json = JSON.parse(
							fs.readFileSync(
								app_config.project_root + "/builder.thinx.dist.json"
							)
						);

						console.log("[builder] Preparing build template: "+JSON.stringify(thinx_json));

						if (typeof(api_envs) === "undefined" || api_envs === null) {
							console.log("[builder] No env vars to apply...");
							api_envs = [];
						} else {
							console.log("[builder] Should apply API Envs..." + JSON.stringify(api_envs));
						}

						if (api_envs.count > 0) {
							console.log("[builder] Applying environment vars...");
							for (var object in api_envs) {
								var key = Object.keys(object)[0];
								console.log("Setting " + key + " to " + object[key]);
								thinx_json[key] = object[key];
							}
						} else {
							console.log("[builder] No environment vars to apply...");
						}

						// Attach/replace with important data
						console.log("[builder] // Attach important data...");
						thinx_json.THINX_ALIAS = device.alias;
						thinx_json.THINX_OWNER = device.owner;
						thinx_json.THINX_API_KEY = api_key; // inferred from last_key_hash

						console.log("[builder] // Replace important data...");
						thinx_json.THINX_COMMIT_ID = commit_id.replace("\n", "");
						thinx_json.THINX_FIRMWARE_VERSION_SHORT = git_tag.replace("\n", "");
						thinx_json.THINX_FIRMWARE_VERSION = REPO_NAME + ":" + git_tag.replace("\n", "");
						thinx_json.THINX_UDID = udid;

						console.log("[builder] // Add revision tag...");
						thinx_json.THINX_APP_VERSION = v.revision(); // should be parametrized to build path!
						console.log("[builder] // Added revision " + thinx_json.THINX_APP_VERSION);

						console.log("[builder] // Attach/replace with more specific data...");
						thinx_json.THINX_CLOUD_URL = app_config.base_url;
						thinx_json.THINX_MQTT_URL = app_config.mqtt.server.replace("mqtt://", ""); // due to problem with slashes in json and some libs on platforms
						thinx_json.THINX_AUTO_UPDATE = true; // device.autoUpdate
						thinx_json.THINX_MQTT_PORT = app_config.mqtt.port;
						thinx_json.THINX_API_PORT = app_config.port;
						//thinx_json.THINX_API_PORT = app_config.secure_port; // we wish
						thinx_json.THINX_PROXY = "thinx.local";
						thinx_json.THINX_PLATFORM = platform;
						thinx_json.THINX_AUTO_UPDATE = device.auto_update;
						// <-- extract to here

						console.log("[builder] // Overview:");

						console.log(JSON.stringify(thinx_json));

						console.log("[builder] Writing template to thinx_build.json...");

						try {
							fs.writeFileSync(
								XBUILD_PATH + "/thinx_build.json",
								JSON.stringify(thinx_json)
							);
						} catch (err) {
							console.log("[builder] writing template failed with error" + err);
							blog.state(build_id, owner, udid, "failed");
							this.notify(udid, notifiers, "error_configuring_build", false);
							return;
						}

						console.log(
							"[builder] Calling pre-builder to generate headers from thinx_build.json..."
						);

						if (XBUILD_PATH.indexOf("undefined") !== -1) {
							console.log("XBUILD_PATH_ERROR:" + XBUILD_PATH);
							return;
						}

						var PRE = "cd " + ROOT + "; " + ROOT +
							"/pre-builder --json=" + XBUILD_PATH +
							"/thinx_build.json --workdir=" + XBUILD_PATH +
							" --root=" + ROOT;

						console.log("Pre-building with command: " + PRE);

						try {
							var presult = exec.execSync(PRE);
							console.log("[builder] Pre-build: " + presult.toString());
						} catch (e) {
							callback(false, {
								success: false,
								status: "pre_build_failed"+e
							});
							return;
						}

						console.log("[builder] Start build env...");

						var CMD = "cd " + ROOT + ";" + ROOT +
							"/builder --owner=" + owner +
							" --udid=" + udid +
							" --git=" +
							git + " --id=" + build_id + " --workdir=" +
							XBUILD_PATH;

						if (dryrun === true) {
							CMD += " --dry-run";
						}

						if (udid === null) {
							console.log("[builder] Cannot build without udid!");
							this.notify(udid, notifiers, "error_starting_build", false);
							blog.state(build_id, owner, udid, "failed");
							return;
						}

						// Add API Environment variables and run the build
						apienv.list(owner, (success, keys) => {
							if (!success) {
								console.log("[builder] Custom ENV Vars not loaded.");
							} else {
								var stringVars = JSON.stringify(keys);
								console.log("[builder] Build with Custom ENV Vars: " + stringVars);
								CMD = CMD + " --env=" + stringVars;
							}
							console.log("[builder] Building with command: " + CMD);
							this.notify(udid, notifiers, "build_running", true);
							this.runShell(CMD, owner, build_id, udid, notifiers);
						});

					});
				});
			});
		}); // devicelib.get
	}

	// public

	build(owner, build, notifiers, callback) {

		var build_id = uuidV1();
		var udid;

		if (typeof(callback) === "undefined") {
			callback = () => {};
		}

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
		}, (err, body) => {

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
			var device;

			for (var row in rows) {
				//if (!rows.hasOwnProperty(row)) continue;
				if (!rows[row].hasOwnProperty("doc")) continue;
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

			if ((typeof(device) === "undefined") || udid === null) {
				console.log("Device not found for this source/build.");
				callback(false, "device_not_found");
				return;
			}

			console.log("Building for device: " + JSON.stringify(device));

			// Converts build.git to git url by seeking in users' repos
			userlib.get(owner, (err, doc) => {

				if (err) {
					console.log("[builder] " + err);
					callback(false, {
						success: false,
						status: "device_fetch_error"
					});
					return;
				}

				if ((typeof(doc) === "undefined") || doc === null) {
					callback(false, "no_such_owner", build_id);
					return;
				}

				var git = null;
				var branch = "origin/master";

				// Finds first source with given source_id
				var sources = Object.keys(doc.repos);

				console.log("[builder] searching: " + JSON.stringify(doc.repos) + " in: " + JSON.stringify(
					sources));

				for (var index in sources) {
					//if (typeof(doc.repos) === "undefined") continue;
					//if (!sources.hasOwnProperty(index)) continue;
					//if (!doc.repos.hasOwnProperty(sources[index])) continue;
					var source = doc.repos[sources[index]];
					var source_id = sources[index];
					if (typeof(source_id) === "undefined") {
						console.log("[builder] source_id at index " + index + "is undefined, skipping...");
						continue;
					}
					if (source_id.indexOf(build.source_id) !== -1) {
						git = source.url;
						branch = source.branch;
						console.log("[builder] git found: " + git);
						break;
					}
				}

				if (!this.containsNullOrUndefined([udid, build, owner, git])) {
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
				//devicelib.destroy(device._id, device._rev, (err) => {

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

				devicelib.atomic("devicelib", "modify", device.udid, device, (error, body) => {
					if (error) {
						console.log(error);
						devicelib.insert(device, device.udid,
							(err, body, header) => {
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

				this.run_build(build_id, owner, git, branch, udid, dryrun, notifiers, callback);

			});
		});
	}

	supportedLanguages() {
		var languages_path = app_config.project_root + "/languages";
		var languages = fs.readdirSync(languages_path).filter(
			file => fs.lstatSync(path.join(languages_path, file)).isDirectory()
		);
		//console.log("Supported languages: " + JSON.stringify(languages));
		return languages;
	}

	supportedExtensions() {
		var languages_path = app_config.project_root + "/languages";
		var languages = this.supportedLanguages();
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
