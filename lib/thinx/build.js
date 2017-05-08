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

		log: function(build_id, owner, udid, message) {

			var mtime = new Date();

			var record = {
				"message": message,
				"owner": owner,
				"udid": udid,
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

				var path = deploy.pathForDevice(body.owner, body.udid);
				var build_log_path = path + "/" + build_id + ".log";
				var log_contents = fs.readFileSync(build_log_path);

				body.log = JSON.stringify({
					contents: log_contents
				});

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
