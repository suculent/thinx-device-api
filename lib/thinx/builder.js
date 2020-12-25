/** This THiNX-RTM API module is responsible for managing builds and should be offloadable to another server. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var db = app_config.database_uri;
var ROOT = __dirname + "/../..";

const { v1: uuidV1 } = require('uuid');

const mkdirp = require("mkdirp");
const exec = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const finder = require("fs-finder");
const YAML = require('yaml');
var Git = require("./git");

var devicelib = require("nano")(db).use(prefix + "managed_devices");
var userlib = require("nano")(db).use(prefix + "managed_users");

var APIEnv = require("./apienv"); var apienv = new APIEnv();
var BuildLog = require("./buildlog"); var blog = new BuildLog();
var ApiKey = require("./apikey"); var apikey = new ApiKey();
var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
var Platform = require("./platform"); var _platform = new Platform();

var shellescape = require('shell-escape');

const chalk = require('chalk');

module.exports = class Builder {

	constructor() {
		this.io = null;
	}

	setIo(io) {
		this.io = io;
	}

	wsError(websocket, message) {
		if (typeof (websocket) !== "undefined" && websocket !== null) {
			try {
				websocket.send(JSON.stringify({ notification: message }));
			} catch (e) {
				console.log(e);
			}
		}
	}

	buildGuards(callback, owner, git, branch) {
		if (typeof (owner) === "undefined") {
			console.log("owner is undefined, exiting!");
			if (typeof (callback) !== "undefined") {
				callback(false, "owner undefined");
			}
			return false;
		}

		if (typeof (git) === "undefined") {
			console.log("git is undefined, exiting!");
			if ((typeof (callback) !== "undefined") && (callback !== null)) {
				callback(false, "git undefined");
			}
			return false;
		}

		if (typeof (branch) === "undefined") {
			console.log("branch is undefined, exiting!");
			if ((typeof (callback) !== "undefined") && (callback !== null)) {
				callback(false, "branch undefined");
			}
			return false;
		}
		return true;
	}

	sendNotificationIfSocketAlive(websocket, notification) {
		if (typeof (websocket) === "undefined" || websocket === null) {
			return;
		}

		try {
			if (websocket.isAlive) {
				if (typeof (notification) !== "string") {
					console.log("WSS-DEBUG: ", notification);
				}
				websocket.send(notification, function ack(error) {
					/* We ignore errors here, the socket may have been closed anytime. */
				});
			} else {
				console.log("Skipping dead websocket notification.");
			}
		} catch (e) {
			console.log("[builder] ws_send_exception" + e);
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

	buildStatusNotification(message, messageType, udid) {
		return JSON.stringify({
			notification: {
				title: "Build Status",
				body: message.toString(),
				type: messageType,
				udid: udid
			}
		});
	}

	buildLogNotification(message, messageType, udid) {
		return {
			log: {
				title: "Build Status",
				body: message.toString(),
				type: messageType,
				udid: udid
			}
		};
	}

	// Used to sends a build status notification using websocket
	notify(udid, notifiers, message, success_status) {
		var status = this.successStringFromBool(success_status);
		if (message.indexOf("build_running") !== -1) {
			status = "info"; // blue
		}
		this.sendNotificationIfSocketAlive(
			notifiers.websocket,
			this.buildStatusNotification(message, status, udid)
		);
	}

	getLastAPIKey(owner, udid, callback) {
		console.log("[builder] Fetching LAST API Key for owner " + owner);
		apikey.get_last_apikey(owner, udid, callback);
	}

	runRemoteShell(worker, CMD, owner, build_id, udid, notifiers) {

		if (typeof(worker.socket) === "undefined") {			
			let message = "ERROR: worker needs socket for remote builds";
			console.log(message);
			this.notify(
				udid,
				notifiers,
				message,
				this.successStringFromBool(false)
			);
			return;
		}
		
		let job = {
			mock: false,
			build_id: build_id,
			owner: owner,
			udid: udid,
			cmd: CMD,
			path: "owner/udid/<deprecated>",
			secret: process.env.WORKER_SECRET || null
		};

		this.io.emit('job', job);

		worker.socket.on('log', (data) => {
            // TODO: forward log to web UI, no need to process.
			this.processShellData(owner, build_id, udid, notifiers, data);
        });

		worker.socket.on('job-status', (data) => {
            
			// TODO: forward log to web UI, no need to process.
			this.processShellData(owner, build_id, udid, notifiers, data);

			// maybe change to this.processRemoteJobData(...);

			// Worker sends 'job-status' event on error event, not a build-id event
			// this.processShellError(owner, build_id, udid, data);

			// Worker sends 'job-status' on exit event, not a build-id event
			// this.processExitData(owner, build_id, udid, notifiers, code);

        });

		console.log("[OID:" + owner + "] [BUILD_STARTED] REMOTE execution requested.");
	}

	processExitData(owner, build_id, udid, notifiers, code) {
		if (code > 0) {
			this.notify(udid, notifiers, "Failed", false);
			blog.state(build_id, owner, udid, "failed");
			this.wsError(notifiers.websocket, "Build failed.");
		} else {
			this.notify(udid, notifiers, "Completed", true);
			blog.state(build_id, owner, udid, "Success");
			this.wsError(notifiers.websocket, "Build successful.");
		}
	}

	processShellError(owner, build_id, udid, data) {
		var dstring = data.toString();
		console.log("[STDERR] " + data);
		if (dstring.indexOf("fatal:") !== -1) {
			blog.state(build_id, owner, udid, "failed");
		}
	}

	processShellData(owner, build_id, udid, notifiers, data) {
		var logline = data.toString();
		if (logline.length > 1) { // skip empty lines in log
			logline.replace(/\r/g, '');
			logline.replace(/\n/g, '');
			console.log("[" + build_id + "] »»", logline);
			// just a hack while shell.exit does not work or fails with another error
			if (logline.indexOf("STATUS OK") !== -1) {
				this.notify(udid, notifiers, "Completed", true);
				blog.state(build_id, owner, udid, "Success");
				this.wsError(notifiers.websocket, "Build successful.");
			}
		}

		// Something must write to build_path/build.log where the file is tailed from to websocket...
		var device_path = blog.pathForDevice(owner, udid);
		var build_log_path = device_path + "/" + build_id + "/build.log";
		fs.ensureFile(build_log_path, function (err) {
			fs.appendFileSync(build_log_path, logline);
		});

		// Tries to send but socket will be probably closed.
		this.sendNotificationIfSocketAlive(
			notifiers.websocket,
			logline
		);
	}

	runShell(CMD, owner, build_id, udid, notifiers) {

		var shell = exec.spawn(CMD, { shell: true });

		console.log("[OID:" + owner + "] [BUILD_STARTED] LOCAL EXEC from " + __dirname);

		shell.stdout.on("data", (data) => {
			this.processShellData(owner, build_id, udid, notifiers, data);
		});

		shell.stderr.on("data", (data) => {
			this.processShellError(owner, build_id, udid, data);
		});

		shell.on("exit", (code) => {
			console.log("[OID:" + owner + "] [BUILD_COMPLETED] LOCAL [builder] with code " + code);
			this.processExitData(owner, build_id, udid, notifiers, code);
		}); // end shell on exit
	}

	containsNullOrUndefined(array) {
		for (var index in array) {
			const item = array[index];
			if (typeof (item) === "undefined") return false;
			if (item === null) return false;
			if (item.length === 0) return false;
		}
		return true;
	}

	run_build(br, notifiers, callback) {

		console.log("[builder] [BUILD_STARTED] Executing build chain with", br);

		let build_id = br.build_id;
		let owner = br.owner;
		let git = br.git;
		let branch = br.branch;
		let udid = br.udid;

		if (typeof(br.worker.socket) === "undefined") {
			console.log("[builder] [BUILD_FAILED] Worker socket missing in Build Request:", br);
			return;
		}

		if (!this.buildGuards(callback, owner, git, branch)) {
			console.log("[builder] [BUILD_FAILED] Invalid Build Request.", br);
			return;
		}

		blog.log(build_id, owner, udid, "started"); // may take time to save, initial record to be edited using blog.state

		console.log("[builder] Fetching device " + udid + " for owner " + owner);

		if ((build_id.length > 64)) {
			console.log("Invalid build id.");
			return;
		}

		// Fetch device info to validate owner and udid
		devicelib.get(udid, (err, device) => {

			if (err) {
				callback(false, "no_such_udid");
				return;
			}

			var sanitized_build = sanitka.branch(build_id);
			var BUILD_PATH = app_config.data_root + app_config.build_root + "/" + device.owner + "/" + device.udid + "/" + sanitized_build;

			// Embed Authentication
			this.getLastAPIKey(owner, udid, (success, api_key) => {

				if (api_key === null) {
					console.log("Build requires API Key.");
					callback(false, "build_requires_api_key");
					blog.state(build_id, owner, udid, "failed");
					return;
				}

				if (!success) return;

				//
				// Create deployment path
				//

				var mkresult = mkdirp.sync(BUILD_PATH);

				if (!mkresult) {
					console.log("mkdirp.sync ended with with:", mkresult);
				}

				this.notify(udid, notifiers, "Pulling repository", true);

				/*
				// this is just a log object...
				const state = {
					build_id: build_id,
					owner: owner,
					udid: udid,
					state: "started"
				};

				console.log("Loggin state: " + JSON.stringify(state, false, 2));
				*/
				console.log("build_id", build_id, "owner", owner, "udid", udid);

				// Error may be emutted if document does not exist here.
				// blog.state(build_id, owner, udid, "started"); // initial state from "created", seems to work...

				console.log("[builder] Build path:" + BUILD_PATH + " created.");

				//
				// Fetch GIT repository
				//

				if (typeof (branch) === "undefined") {
					branch = "origin/master";
				}

				var sanitized_branch = sanitka.branch(branch);

				if (branch === null) {
					sanitized_branch = "master";
				}

				var sanitized_url = sanitka.url(git);
				sanitized_url = shellescape([sanitized_url]);
				sanitized_url = sanitka.deescape(sanitized_url);

				//console.log("[builder] Pre-fetching", sanitized_url, "from", git, "to", BUILD_PATH, "...");

				// does initial fetch and then enters directory and pulls all submodules
				var SHELL_FETCH = "cd " + BUILD_PATH + "; rm -rf ./*; " +
					" if $(git clone \"" + sanitized_url + "\"  -b " + sanitized_branch + "); " +
					"then cd *; " +
					"git pull origin " + sanitized_branch + " --recurse-submodules; " +
					"echo { \"basename\":\"$(basename $(pwd))\", \"branch\":\"" + sanitized_branch + "\" } > ../basename.json;" +
					"fi";

				try {
					console.log("Running command " + SHELL_FETCH);
					exec.execSync(SHELL_FETCH).toString().replace("\n", "");
				} catch (e) {
					console.log("[builder] git_fetch_exception " + e);
					// do not exit, will try again with private keys...
				}

				// try to solve access rights issue by using owner keys...
				let ptemplate = BUILD_PATH + "/basename.json";
				console.log("Searching files in ", ptemplate);
				const git_success = fs.existsSync(ptemplate); // must be file
				console.log("Initial prefetch successful? : " + git_success);
				if (git_success == false || git_success == []) {
					let gitTool = new Git();
					let gfr = gitTool.fetch(owner, SHELL_FETCH, BUILD_PATH);
					if (!gfr) {
						console.log("Secondary git fetch failed. That's bad.");
						console.log("Saving state FAILED for build_id", build_id, "owner", owner, "udid", udid);
						blog.state(build_id, owner, udid, "failed");
						return;
					} else {
						console.log("[builder] Secondary GIT Fetch Result: " + gfr);
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
					blog.state(build_id, owner, udid, "failed");
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

				_platform.getPlatform(XBUILD_PATH, (get_success, platform) => {

					if (!get_success) {
						console.log("[builder] failed on unknown platform" + platform);
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

					console.log("device.platform(A): ", platform);

					var platform_array = platform.split(":");
					var device_platform = platform_array[0]; // should work even without delimiter
					var device_mcu = platform_array[1];

					const yml_path = XBUILD_PATH + "/thinx.yml";
					const isYAML = fs.existsSync(yml_path);

					var y_platform = device_platform;

					console.log("pre y_platform(A): ", y_platform);

					if (isYAML) {

						const y_file = fs.readFileSync(yml_path, 'utf8');
						const yml = YAML.parse(y_file);

						if (typeof (yml) !== "undefined") {
							console.log("[builder] Parsed YAML: " + JSON.stringify(yml));
							// This takes first key. It could be possible to have more keys (array allows same names)
							// and find the one with closest platform.
							y_platform = Object.keys(yml)[0];
							console.log("[builder] YAML-based platform: " + y_platform);
							const y_mcu = yml[y_platform].arch;
							if (typeof(device_mcu) !== "undefined") {
								if (y_mcu.indexOf(device_mcu) == -1) {
									const message = "[builder] MCU defined by thinx.yml (" + y_mcu + ") not compatible with this device MCU: " + device_mcu;
									console.log(message);
									this.notify(udid, notifiers, message, false);
									blog.state(build_id, owner, udid, "failed");
									callback(false, message);
									return;
								} else {
									console.log("[builder] MCU is compatible.");
								}
							}

							console.log("parsed y_platform(A): ", y_platform);

							/* Store platform + architecture if possible (o'rly?... we need y_platform later. REFACTOR)
							if ( (typeof(yml.arduino) !== "undefined") &&
									 (typeof(yml.arduino.arch) !== "undefined") ) {
										 device_platform = y_platform + ":" + yml.arduino.arch;
							}*/

							/* Export device specific env-vars to environment.yml, should decrypt later as well */
							let device_specific_environment = device.environment;
							if (typeof(device_specific_environment) !== "undefined") {
								let envString = JSON.stringify(device_specific_environment);
								let envFile = XBUILD_PATH + '/environment.json';
								console.log("Saving device-specific envs to", envFile);
								if (fs.existsSync(XBUILD_PATH)) { // validate to prevent injection
									fs.writeFileSync(envFile, envString, 'utf8');
								}
							} else {
								console.log("No custom envs found in:", {device});
							}

						}
					} else {
						console.log("[builder] BuildCommand-Detected platform (no YAML at " + yml_path + "): " + platform);
					}

					// <- platform_descriptor needs header (maybe only, that's OK)

					var d_filename = __dirname + "/../../platforms/" +
						y_platform + "/descriptor.json";

					if (!fs.existsSync(d_filename)) {
						console.log("[builder] no descriptor found in file " + d_filename);
						blog.state(build_id, owner, udid, "failed");
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
						if ((typeof (h_file) !== "undefined") && h_file !== null) {
							header_file = h_file[0];
						}
						console.log("[builder] found header_file: " + header_file);
					} catch (e) {
						console.log(
							"TODO: FAIL HERE: Exception while getting header file, use FINDER instead!: " + e);
							blog.state(build_id, owner, udid, "failed");
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

					apienv.list(owner, (list_success, api_envs) => {

						console.log("[builder] Fetched ENVs...");

						if (!list_success) {
							console.log("[builder] [APIEnv] Listing failed:" + owner);
							// must not be blocking
						}

						console.log("[builder] Preparing build template...");

						// --> extract from here
						var thinx_json = JSON.parse(
							fs.readFileSync(
								__dirname + "/../../builder.thinx.dist.json"
							)
						);

						console.log("[builder] Preparing build template: " + JSON.stringify(thinx_json));

						if (typeof (api_envs) === "undefined" || api_envs === null) {
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

						console.log("[builder] // Attach/replace with more specific data...");
						thinx_json.THINX_CLOUD_URL = app_config.base_url;
						thinx_json.THINX_MQTT_URL = app_config.mqtt.server.replace("mqtt://", ""); // due to problem with slashes in json and some libs on platforms
						thinx_json.THINX_AUTO_UPDATE = true; // device.autoUpdate
						thinx_json.THINX_MQTT_PORT = app_config.mqtt.port;
						thinx_json.THINX_API_PORT = app_config.port;

						if (typeof (app_config.secure_port) !== "undefined") {
							thinx_json.THINX_API_PORT_SECURE = app_config.secure_port;
						}

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
						} catch (write_err) {
							console.log("[builder] writing template failed with error" + write_err);
							blog.state(build_id, owner, udid, "failed");
							this.notify(udid, notifiers, "error_configuring_build", false);
							return;
						}

						console.log("[builder] Calling pre-builder to generate headers from thinx_build.json...");

						if (XBUILD_PATH.indexOf("undefined") !== -1) {
							console.log("XBUILD_PATH_ERROR:" + XBUILD_PATH);
							blog.state(build_id, owner, udid, "failed");
							return;
						}

						const PRE = "cd " + ROOT + "; " + ROOT +
							"/pre-builder --json=" + XBUILD_PATH +
							"/thinx_build.json --workdir=" + XBUILD_PATH +
							" --root=" + ROOT;

						console.log("Pre-building with command: " + PRE);

						try {
							const presult = exec.execSync(PRE);
							console.log("[builder] Pre-build: " + presult.toString());
						} catch (e) {
							blog.state(build_id, owner, udid, "failed");
							callback(false, {
								success: false,
								status: "pre_build_failed" + e
							});
							return;
						}

						callback(true, {
							success: true,
							status: "build_started"
						});

						// DevSec uses only 2nd part of MAC, because beginning
						// is always same for ESPs and thus easily visible.
						function formatMacForDevSec(incoming) {
							let no_colons = incoming.replace(/:/g, "");
							let outgoing = no_colons.substr(6, 6);
							return outgoing;
						}

						var fcid = "000000";
						if (typeof (device.fcid) !== "undefined") {
							fcid = device.fcid;
						}

						let dry_run = (br.dryrun === true) ? " --dry-run" : "";

						if (udid === null) {
							console.log("[builder] Cannot build without udid!");
							this.notify(udid, notifiers, "error_starting_build", false);
							blog.state(build_id, owner, udid, "failed");
							return;
						}

						// Add API Environment variables and run the build
						apienv.list(owner, (env_list_success, keys) => {
							
							let CMD = "";

							// Local Build
							if (br.worker == false) {
								CMD = "cd " + ROOT + ";" + ROOT + "/";
							}

							// Remote Build
							CMD += "./builder --owner=" + owner +
							" --udid=" + udid +
							" --fcid=" + fcid +
							" --mac=" + formatMacForDevSec(device.mac) +
							" --git=" + git +
							" --branch=" + sanitized_branch +
							" --id=" + build_id +
							" --workdir=" + XBUILD_PATH +
							dry_run;

							if (!env_list_success) {
								console.log("[builder] Custom ENV Vars not loaded.");
							} else {
								var stringVars = JSON.stringify(keys);
								console.log("[builder] Build with Custom ENV Vars: " + stringVars);
								CMD = CMD + " --env=" + stringVars;
							}
							console.log("[builder] Building with command: " + CMD);
							this.notify(udid, notifiers, "Building...", true);

							if (br.worker == false) {
								console.log("[builder] Starting LOCAL build...");
								this.runShell(CMD, owner, build_id, udid, notifiers);
							} else {
								console.log("[builder] Starting REMOTE build...");
								let REMOTE_ROOT_DROP = "cd " + ROOT + ";" + ROOT;
								CMD.replace(REMOTE_ROOT_DROP, ".");
								this.runRemoteShell(br.worker, CMD, owner, build_id, udid, notifiers);
							}
							
						});

					});
				});
			});
		}); // devicelib.get
	}

	// public

	build(owner, build, notifiers, callback, worker) {

		var build_id = uuidV1();
		var udid;

		if (typeof (callback) === "undefined") {
			callback = () => { };
		}

		var dryrun = false;
		if (typeof (build.dryrun) !== "undefined") {
			dryrun = build.dryrun;
		}

		if (typeof (build.udid) !== "undefined") {
			if (build.udid === null) {
				callback(false, {
					success: false,
					status: "missing_device_udid"
				});
				return;
			}
			udid = sanitka.udid(build.udid);
		} else {
			console.log("NOT Assigning empty build.udid! " + build.udid);
		}

		if (typeof (build.source_id) === "undefined") {
			callback(false, {
				success: false,
				status: "missing_source_id"
			});
			return;
		}

		if (typeof (owner) === "undefined") {
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
				if (typeof (device.owner) !== "undefined") {
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

			if ((typeof (device) === "undefined") || udid === null) {
				console.log("Device not found for this source/build.");
				callback(false, "device_not_found");
				return;
			}

			//console.log("Building for device: " + JSON.stringify(device));

			// Converts build.git to git url by seeking in users' repos
			userlib.get(owner, (user_get_err, doc) => {

				if (user_get_err) {
					console.log("[builder] " + user_get_err);
					callback(false, {
						success: false,
						status: "device_fetch_error"
					});
					return;
				}

				if ((typeof (doc) === "undefined") || doc === null) {
					callback(false, "no_such_owner", build_id);
					return;
				}

				var git = null;
				var branch = "origin/master";

				// Finds first source with given source_id
				var all_sources = Object.keys(doc.repos);
				for (var index in all_sources) {
					//if (typeof(doc.repos) === "undefined") continue;
					//if (!sources.hasOwnProperty(index)) continue;
					//if (!doc.repos.hasOwnProperty(sources[index])) continue;
					var source = doc.repos[all_sources[index]];
					var source_id = all_sources[index];
					if (typeof (source_id) === "undefined") {
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
				console.log("[builder] owner: " + owner);
				console.log("[builder] git: " + git);
				console.log("[builder] branch: " + branch);

				let changes = {
					build_id: build_id
				};

				console.log("Build atomically updating device with " + JSON.stringify(changes));


				// Marks only the build_id, doesn't it?
				devicelib.atomic("devicelib", "modify", device.udid, changes, (mod_error) => {
					if (mod_error) {
						console.log("Atomic update failed", {mod_error});
						/* rather not
						devicelib.insert(device, device.udid,
							(insert_error, insert_body) => {
								if (insert_error) {
									console.log("[builder] " + insert_error, insert_body);
								}
							});
							*/
							callback(false, {
								success: false,
								status: "DEVICE MOD FAILED",
								build_id: build_id
							});		

					} else {

						let buildRequest = {
							build_id: build_id,
							owner: owner,
							git: git,
							branch: branch,
							udid: udid,
							dryrun: dryrun,
							worker: worker
						};
		
						this.run_build(buildRequest, notifiers, callback);

						if (typeof(callback) === "undefined") {
							console.log("Warning, callback missing!");
						}

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

						//console.log("Callback sent, proceeding to build asynchronously...");
		
						// TODO: refactoring long params list to `build_request` object with attached designated worker (or null for local builds)
						

					}
				});
			});
		});
	}

	supportedLanguages() {
		var languages_path = __dirname + "/../../languages";
		var languages = fs.readdirSync(languages_path).filter(
			file => fs.lstatSync(path.join(languages_path, file)).isDirectory()
		);
		//console.log("Supported languages: " + JSON.stringify(languages));
		return languages;
	}

	supportedExtensions() {
		var languages_path = __dirname + "/../../languages";
		var languages = this.supportedLanguages();
		var extensions = [];
		for (var lindex in languages) {
			var dpath = languages_path + "/" + languages[lindex] +
				"/descriptor.json";
			var descriptor = require(dpath);
			if (typeof (descriptor) !== "undefined") {
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
