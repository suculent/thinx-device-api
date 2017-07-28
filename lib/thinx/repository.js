/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Repository = (function() {

	var fs = require("fs-extra");
	var path = require("path");
	var app_config = require("../../conf/config.json"); // this file should be actually omitted from repository
	var exec = require("child_process");
	var exit_callback = function(status) {};
	var githooked = require("githooked");

	function timeoutFunction(local_path, repeat, callback) {
		return function() {
			Repository.checkRepositoryChange(local_path, false, callback);
		};
	}

	console.log("Starting githook service on port 9001...");

	// && platformio run
	githooked("push", "git pull", {
		json: {
			limit: "100mb",
			strict: true
		},
		middleware: [
			require("connect-timeout"),
			function(req, res, next) {
				// Do something
				console.log("githooked middleware function called:");
				console.log(JSON.stringify(req));

				var fullname = req.repository.fullname;
				// TODO: Walk through all repositories, fetch and build...
				console.log("TODO: Build this repository (all instances):" +
					fullname);
				next();
			}
		]
	}).listen(9001);

	githooked().on('push', function(info) {
		console.log('ref ' + info.ref + ' was pushed.');
	});

	githooked().on('delete', function(info) {
		console.log('ref ' + info.ref + ' was deleted.');
	});

	// public
	var _public = {

		watchRepository: function(local_path, callback) {

			if (typeof(callback) !== "undefined") {
				this.exit_callback = callback;
			} else {
				this.exit_callback = function() {
					return true;
				};
			}

			if (local_path === null) {
				local_path = ".";
			}

			this.watcher = {
				repository: local_path,
				callback: callback,
				run: true
			};

			if (typeof(callback) === "undefined") {
				console.log(
					"[REPOSITORY] Warning, no watch callback given, watching anyway...");
			}

			this.checkRepositoryChange(local_path, true, this.exit_callback);
		},

		unwatchRepository: function() {

			if (this.watcher) {
				console.log("[REPOSITORY] Stopping watcher for " + this.watcher.repository);
				if (typeof(exit_callback) !== "undefined") {
					exit_callback();
				} else {
					console.log("[REPOSITORY] WARNING! Watcher has no callback.");
				}
			} else {
				console.log("[REPOSITORY] unwatchRepository: no watcher... exiting.");
				if (typeof(exit_callback) !== "undefined") {
					exit_callback(false);
				}
			}
		},

		/*
		 * Perform a pull on repository to find out if there are new commits.
		 */

		checkRepositoryChange: function(local_path, repeat, check_callback) {

			console.log("[REPOSITORY] Checking change by git pull at: " + local_path);

			/* this hack should deprecate */
			if (typeof(check_callback) === "undefined") {
				check_callback = function(arg) {};
			}

			/* whoa whoa who was drunk here? who should throw? */
			if (typeof(local_path) === "undefined" || local_path === null) {
				throw new Error('checkRepositoryChange: local_path must be valid');
			}

			// Search for a git repository in root folder is doomed to return false
			var gitdir = local_path + "/.git";
			if (!fs.existsSync(gitdir)) {

				console.log("[REPOSITORY][ERROR] Not a git repo here (1): " + gitdir);

				// Fetch all repositories on the REPO_PATH/local_path
				var directories = fs.readdirSync(local_path).filter(
					file => fs.lstatSync(path.join(local_path, file)).isDirectory()
				);

				// find inner path with git folder, adjust and break
				for (var dindex in directories) {
					var inner_path = local_path + "/" + directories[dindex] + "/.git";
					if (fs.lstatSync(inner_path).isDirectory()) {
						local_path = local_path + "/" + directories[dindex];
						gitdir = inner_path;
						break;
					}
				}
			}

			if (!fs.lstatSync(gitdir).isDirectory()) {
				console.log("This is not a git repo: " + __dirname + "(localpath: " +
					local_path + "/.git )");
				if (typeof(check_callback) === "function") {
					check_callback({
						local_path: local_path,
						version: "n/a",
						revision: "n/a",
						changed: false
					});
				}
				return;
			}

			var CMD = "cd " + gitdir + "; git pull";
			var nochange = "Already up-to-date.";
			var temp = exec.execSync(CMD).toString().replace("\n", "");

			if (this.timer !== null) {
				clearTimeout(this.timer);
			}

			if (temp.indexOf(nochange) !== -1) {

				if (repeat === false) {
					return false;
				} else {
					// watcher needs to be set before calling check
					// console.log("Watcher: " + JSON.stringify(watcher));
					if (typeof(this.watcher) !== "undefined" || this.watcher !== null) {
						console.log("[REPOSITORY] Setting watcher timer for " + local_path);
						this.timer = setTimeout(timeoutFunction(
							local_path,
							repeat,
							check_callback), 30000);
					} else {
						return false;
					}
				}
			} else {

				console.log("[REPOSITORY] git-watch: " + gitdir +
					" : repository updated with timer");

				console.log("[REPOSITORY] Current version: " + this.getRevisionNumber());
				console.log("[REPOSITORY] Current revision: " + this.getRevision());

				// TODO: Mark as update-available somwehere in user sources by setting 'available_version',
				// which will be then non-null and if higher than firmware version, new build is available...
				// ...but; it would be safer to save filename timestamp on build and then always compare
				// with real filename (but it takes lot of IO power to list all visible devices like file-manager))

				if (typeof(check_callback) === "function") {
					check_callback({
						local_path: local_path,
						version: this.version,
						revision: this.revision,
						changed: true
					});
				}

				return true;
			}
		},

		getRevisionNumber: function() {
			var CMD = "cd " + app_config.project_root +
				"; git rev-list HEAD --count";
			var temp = exec.execSync(CMD).toString().replace("\n", "");
			this.version = parseInt(temp);
			return this.version;
		},

		getRevision: function() {
			var CMD = "cd " + app_config.project_root + "; git rev-parse HEAD";
			var temp = exec.execSync(CMD).toString().replace("\n", "");
			this.revision = temp;
			return temp;
		},

		// returns (platform); or calls back (success, platform)

		getPlatform: function(local_path, callback) {

			var hasManifest = fs.existsSync(local_path + "thinx.json"); // try to read yml with node.js

			//
			// Arduino
			//

			// 1st version:
			var isArduino = fs.existsSync(local_path + "/**/*.ino"); // expect sketch folder!

			// 2nd version:
			var all_directories = fs.readdirSync(local_path).filter(
				file => fs.lstatSync(path.join(local_path, file)).isDirectory()
			);

			directories = all_directories.filter(
				file => (file !== ".git") ? file : null
			);

			//delete directories['.git'];
			//directories.push('..');

			var arduino_local_path = local_path;

			// we cannot touch local_path until we know this is Arduino/project folder
			if (typeof(directories.first) !== "undefined") {
				arduino_local_path = local_path + "/" + directories.first;
			}

			console.log("Repository contains directories: " + JSON.stringify(
				directories));

			function getINOS(srcpath) {

				var allfolders = fs.readdirSync(srcpath)
					.filter(file => fs.lstatSync(path.join(srcpath, file)).isDirectory());

				var folders = allfolders.filter(file => file.indexOf(".git" === -1) ?
					file : null);

				var folder = null;
				for (var findex in folders) {
					var dirpath = srcpath + "/" + folders[findex];
					// TODO: match index with end of file - 4 to have exact result
					var inos = fs.readdirSync(dirpath).filter(
						file => (file.indexOf(".ino") !== -1)
					);
					if (inos.count > 0) {
						console.log("No inos " + JSON.stringify(inos) + " found in in " +
							dirpath);
						folder = allfolders[findex];
					} else {
						console.log("No .inos in " + dirpath);
					}
				}
				return folder;
			}

			var results = [];

			for (var index in directories) {
				var localdir = arduino_local_path + "/" + directories[index];
				console.log("Localdir: " + localdir);
				var ino_folder = getINOS(localdir);
				console.log("inos: " + JSON.stringify(ino_folder));
				if (ino_folder !== null) results.push();
			}

			if (results.length > 0) {
				console.log("Repository contains INOs: " + JSON.stringify(results));
				isArduino = true;
			}

			//
			// Node
			//

			var isNodeJS = fs.existsSync(local_path + "/package.json");
			if (isNodeJS) {
				isNode = true;
			}

			//
			// Platformio
			//

			var isPlatformio = fs.existsSync(local_path + "/platformio.ini");
			if (isPlatformio) {
				isArduino = false;
			}

			//
			// NodeMCU (LUA)
			//

			var isLUA = fs.existsSync(local_path + "/init.lua");

			//
			// Micropython
			//

			var isPython = (fs.existsSync(local_path + "/boot.py") ||
				fs.existsSync(local_path + "/main.py"));

			//
			// MongooseOS
			//

			var isMOS = fs.existsSync(local_path + "/default-1.0"); // https://mongoose-os.com/downloads/esp8266.zip

			//////////////////////////////////////////////////////
			// Decision logic
			//

			var platform = "unknown";

			// TODO: Assign platforms by plugin!

			if (isPlatformio) {

				platform = "platformio";

			} else if (isArduino) {

				platform = "arduino";

			} else if (isPython) {

				platform = "python";

			} else if (isLUA) {

				platform = "nodemcu";

			} else if (isMOS) {

				platform = "mongoose";

			} else if (isNodeJS) {

				platform = "nodejs";

			}

			console.log("Detected platform: " + platform);

			if (typeof(callback) !== "undefined") {
				callback(true, platform);
			} else {
				return platform;
			}

		}

	};

	return _public;

})();

exports.watchRepository = Repository.watchRepository;
exports.unwatchRepository = Repository.unwatchRepository;
exports.checkRepositoryChange = Repository.checkRepositoryChange;
exports.getRevisionNumber = Repository.getRevisionNumber;
exports.getRevision = Repository.getRevision;
exports.getPlatform = Repository.getPlatform;
