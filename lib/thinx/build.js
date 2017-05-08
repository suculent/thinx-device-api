/*
 * This THiNX-RTM API module is responsible for build logging.
 */

var Build = (function() {

	var util = require("util");

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);

	nano.db.create("managed_builds", function(err, body, header) {
		if (err.statusCode != 412) {
			console.log(err);
			return;
		}
		console.log("» Build database initialization completed.");
	});

	var buildlib = require("nano")(db).use("managed_builds");

	var _private = {

	};

	// public
	var _public = {

		log: function(build_id, message) {

			var mtime = new Date();

			var record = {
				"message": message,
				"owner": owner,
				"date": mtime
			};

			buildlib.insert(record, build_id, function(err,
				body, header) {
				if (err) {
					console.log(err);
				} else {
					if (body.ok !== true) {
						console.log(JSON.stringify(body));
					}
				}
			});
		},

		fetch: function(build_id, callback) {
			console.log("Warning, actual log is stored in a file!!!");

			buildlib.view("builds", "builds_by_build_id", {
				"key": build_id,
				"include_docs": true
			}, function(err, body) {

				// TODO: Fetch real log. May be called often. Path must be stored in build record for convenience (device/owner is not known here)

				callback(err, body);
			});
		},

		list: function(owner, callback) {
			buildlib.view("builds", "builds_by_owner", {
				"key": owner,
				"include_docs": false
			}, function(err, body) {
				callback(err, body);
			});
		}
	};

	return _public;

})();

exports.log = Build.log;
exports.fetch = Build.fetch;
exports.fetch = Build.list;
