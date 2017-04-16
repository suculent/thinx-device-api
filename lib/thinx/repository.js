/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Repository = (function() {

	var POLLING_TIMEOUT = 15000;

	var exec = require("sync-exec");

	var version; // commit count
	var revision; // commit id
	var local_path; // local repository path in owner folder
	var remote_url;

	var watcher = null;

	var _private = {

	};

	// public
	var _public = {

		watchRepository: function(local_path) {
			watcher = {
				repository: local_path
			};
			this.repositoryChanged(local_path, true);
		},

		unwatchRepository: function() {
			if (watcher) {
				console.log("Stopping watcher for " + watcher.repository);
				this.watcher = {};
			}
		},

		repositoryChanged: function(local_path, repeat) {
			CMD = "git pull";
			var nochange = "Already up-to-date.";

			var temp = exec(CMD).stdout.replace("\n", "");
			if (temp.indexOf(nochange) !== -1) {
				console.log("Repository is up-to-date.");
				if (repeat === false) {
					return false;
				} else {
					// watcher needs to be set before calling check
					if (typeof(watcher) !== "undefined" || watcher !== null) {
						setTimeout(POLLING_TIMEOUT, this.repositoryChanged(local_path, repeat));
					} else {
						return false;
					}
				}
			} else {
				console.log("Repository updated!");
				console.log("Current version: " + this.getRevisionNumber());
				console.log("Current revision: " + this.getRevision());
				watcher = null;
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
