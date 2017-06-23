/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Repository = (function() {

	var fs = require('fs-extra');
	var app_config = require("../../conf/config.json"); // this file should be actually omitted from repository

	var exec = require("child_process");

	var exit_callback = function(status) {};

	var githooked = require("githooked");

	githooked.on('error', function(msg) {
		console.log("githooked error: " + msg);
	});

	function timeoutFunction(local_path, repeat, callback) {
		return function() {
			Repository.checkRepositoryChange(local_path, false, callback);
		};
	}

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

			this.watcher = {
				repository: local_path,
				callback: callback,
				run: true
			};

			if (typeof(callback) === "undefined") {
				console.log(
					"[REPOSITORY] Warning, no watch callback given, watching anyway...");
			}

			// && platformio run
			githooked('push', 'cd '+ local_path + '; git pull', {
				json: {
					limit: '100mb',
					strict: true
				},
				middleware: [
					require('connect-timeout'),
					function(req, res, next) {
						// Do something
						console.log("githooked middleware function called for "+local_path);
						console.log(JSON.stringify(req));
						next();
					}
				]
			}).listen(9000);

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

			var gitdir = local_path + "/.git";
			if (!fs.existsSync(gitdir)) {
				console.log("Not a git repo: " + gitdir);
				return;
			}

			if (!fs.lstatSync().isDirectory()) {
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
		}

	};

	return _public;

})();

exports.watchRepository = Repository.watchRepository;
exports.unwatchRepository = Repository.unwatchRepository;
exports.checkRepositoryChange = Repository.checkRepositoryChange;
exports.getRevisionNumber = Repository.getRevisionNumber;
exports.getRevision = Repository.getRevision;
