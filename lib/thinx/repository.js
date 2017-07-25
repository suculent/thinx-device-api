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

	console.log("[REPOSITORY] Starting githooked...");

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

		checkRepositoryChange: function(local_path, repeat, check_callback) {

			if (typeof(check_callback) === "undefined") {
				check_callback = function(arg) {};
			}

			if (typeof(local_path) === "undefined" || local_path === null) {
				local_path = "";
			} else {
				local_path = local_path + "/";
			}

			var gitdir = local_path + ".git";
			if (!fs.existsSync(gitdir)) {
				console.log("[REPOSITORY][ERROR] Not a git repo here (1): " + gitdir);
				return;
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

			var CMD = "git pull";
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

				console.log("[REPOSITORY] git-watch: " + local_path +
					" : repository updated");

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
			var directories = fs.readdirSync(local_path).filter(
				file => fs.lstatSync(path.join(local_path, file)).isDirectory()
			);

			console.log("Repository contains directories: " + JSON.stringify(
				directories));

			// TODO: FIXME: Should actually find a folder with ino file only...
			function getINOS(srcpath) {
				var allfolders = fs.readdirSync(srcpath)
					.filter(file => fs.lstatSync(path.join(srcpath, file)).isDirectory());
				allfolders.filter(file => file.indexOf(".git" === -1));

				for (var findex in allfolders) {
					// TODO: Find all INO files...
					return allfolders[finders];
				}
			}

			var results = [];

			for (var index in directories) {
				var localdir = local_path + "/" + directories[index];
				console.log("Localdir: " + localdir);
				results.push(getINOS(localdir));
			}

			console.log("Repository contains INOs: " + JSON.stringify(results));

			if (results.length > 0) {
				isArduino = true;
			}

			//
			// Platformio
			//

			var isPlatformio = fs.existsSync(local_path + "/platformio.ini");

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

			}

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
