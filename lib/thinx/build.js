/** This THiNX-RTM API module is responsible for build logging. */

var Build = (function() {

	var util = require("util");

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);

	var deploy = require("./deployment");
	var fs = require("fs");

	nano.db.create("managed_builds", function(err, body, header) {
		if (err.statusCode != 412) {
			console.log("[build] " + err);
		}
	});

	var buildlib = require("nano")(db).use("managed_builds");

	var _private = {

	};

	// public
	var _public = {

		/**
		 * Store new record in build log
		 * @param {string} build_id - UUID of the build
		 * @param {string} owner - 'owner' id of the build owner
		 * @param {string} udid - UDID of the target device
		 * @param {string} message - build log status message
		 */

		log: function(build_id, owner, udid, message) {

			var mtime = new Date();

			var record = {
				"message": message,
				"owner": owner,
				"udid": udid,
				"date": mtime
			};

			buildlib.get(build_id, function(err, existing) {

				if (existing) {

					buildlib.destroy(existing._id, existing._rev, function(err) {

						delete existing._rev;

						existing.log.records.push(record);

						buildlib.insert(record, build_id, function(err,
							body, header) {
							if (err) {
								console.log("[build] existing error build-log: " + err);
							} else {
								if (body.ok !== true) {
									console.log(JSON.stringify(body));
									console.log(JSON.stringify(record));
								} else {
									console.log("[build] appending build-log: " + JSON.stringify(
										record));
								}
							}
						});
					});

				} else {

					var records = {
						log: [record]
					};

					buildlib.insert(records, build_id, function(err,
						body, header) {
						if (err) {
							console.log("[build] new error build-log: " + err);
						} else {
							if (body.ok !== true) {
								console.log(JSON.stringify(body));
								console.log(JSON.stringify(record));
							} else {
								console.log("[build] inserting new build-log: " + JSON.stringify(
									[record]));
							}
						}
					});
				}
			});
		},

		/**
		 * Fetch record from build log
		 * @param {string} build_id - UUID of the build
		 * @param {function} callback (err, body) - async return callback
		 */

		fetch: function(build_id, callback) {

			console.log("[build] Fetching build " + build_id);

			buildlib.view("builds", "builds_by_build_id", {
				"key": build_id,
				"include_docs": true
			}, function(err, body) {
				var path = deploy.pathForDevice(body.owner, body.udid);
				var build_log_path = path + "/" + build_id + ".log";
				console.log("[build] Fetching " + build_log_path);
				var log_contents = fs.readFileSync(build_log_path);
				console.log("[build] Fetched " + log_contents);
				body.log = log_contents;
				console.log("[build] fetched body: " + JSON.stringify(body));
				callback(err, body);
			});
		},

		/**
		 * List build logs
		 * @param {string} owner - 'owner' id
		 * @param {function} callback (err, body) - async return callback
		 */

		list: function(owner, callback) {
			buildlib.view("builds", "builds_by_owner", {
				"key": owner,
				"include_docs": false
			}, function(err, body) {
				if (err) {
					console.log("[build] Error listing builds for owner...");
					console.log("[build] " + JSON.stringify(body));
					callback(err, body);
				} else {
					console.log("[build] Listing builds for owner...");
					console.log(JSON.stringify(body));
					callback(true, body);
				}
			});
		}
	};

	return _public;

})();

exports.log = Build.log;
exports.fetch = Build.fetch;
exports.list = Build.list;
