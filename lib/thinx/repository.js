/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Repository = (function() {

	var POLLING_TIMEOUT = 30000;

	var exec = require("sync-exec");

	var version; // commit count
	var revision; // commit id
	var local_path; // local repository path in owner folder
	var remote_url;

	var watcher = null;
	var exit_callback = null;

	var timer = null;

	var _private = {

	};



	// public
	var _public = {

		watchRepository: function(local_path, callback) {

			watcher = {
				repository: local_path,
				callback: callback,
				run: true
			};

			this.exit_callback = callback;

			this.repositoryChanged(local_path, true, callback);
		},

		unwatchRepository: function() {
			if (this.watcher) {
				console.log("Stopping watcher for " + this.watcher.repository);
				this.watcher.callback(false);
			} else {
				exit_callback(false);
			}
		},

		repositoryChanged: function(local_path, repeat, callback) {

			CMD = "git pull";
			var nochange = "Already up-to-date.";
			var temp = exec(CMD).stdout.replace("\n", "");

			if (this.timer !== null) {
				clearTimeout(this.timer);
			}

			if (temp.indexOf(nochange) !== -1) {

				// debug logging only, may be tedious in app log
				console.log("git-watch: up-to-date.");

				if (repeat === false) {
					return false;
				} else {
					// watcher needs to be set before calling check
					// console.log("Watcher: " + JSON.stringify(watcher));
					if (typeof(this.watcher) !== "undefined" || this.watcher !== null) {
						console.log("Setting watcher timer for " + local_path);

						var timeoutFunction = function(local_path, repeat,
							callback) {
							Repository.repositoryChanged(local_path, repeat,
								callback);
						};

						this.timer = setTimeout(timeoutFunction(
							local_path,
							repeat,
							callback), 30000); // POLLING_TIMEOUT
					} else {
						return false;
					}
				}
			} else {

				console.log("Repository updated!");
				console.log("Current version: " + this.getRevisionNumber());
				console.log("Current revision: " + this.getRevision());

				// TODO: Mark as update-available somwehere in user repos by setting 'available_version',
				// which will be then non-null and if higher than firmware version, new build is available...
				// ...but; it would be safer to save filename timestamp on build and then always compare
				// with real filename (but it takes lot of IO power to list all visible devices like file-manager))

				if (typeof(callback) !== "undefined" && callback !== null) {
					console.log("Calling back to app.");
					callback({
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
			CMD = "git rev-list HEAD --count";
			var temp = exec(CMD).stdout.replace("\n", "");
			this.version = parseInt(temp);
			return this.version;
		},

		getRevision: function() {
			CMD = "git rev-parse HEAD";
			var temp = exec(CMD).stdout.replace("\n", "");
			this.revision = temp;
			return temp;
		}

	};

	return _public;

})();

exports.watchRepository = Repository.watchRepository;
exports.unwatchRepository = Repository.unwatchRepository;
exports.repositoryChanged = Repository.repositoryChanged;
exports.getRevisionNumber = Repository.getRevisionNumber;
exports.getRevision = Repository.getRevision;
