/*
 * This THiNX-RTM API module is responsible for audit logging.
 */

var Audit = (function() {

	var util = require("util");

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);

	nano.db.create("managed_logs", function(err, body, header) {

		if (err.statusCode != 412) {
			console.log(err);
			return;
		}

		console.log("» Log database initialization completed.");
		Audit.log("api", "API started.");

	});

	var loglib = require("nano")(db).use("managed_logs");

	var _private = {

	};

	// public
	var _public = {

		log: function(owner, message) {

			var mtime = new Date();

			var record = {
				"message": message,
				"owner": owner,
				"date": mtime
			};

			loglib.insert(record, mtime, function(err,
				body, header) {
				if (err) {
					console.log("Audit log insertion error.");
					console.log(err);
				} else {
					if (body.ok !== true) {
						console.log(JSON.stringify(body));
					}
				}
			});
		},

		fetch: function(owner, callback) {
			loglib.view("logs", "logs_by_owner", {
					"key": owner,
					"include_docs": true
				},
				function(err, body) {
					if (err) {
						console.log(err);
					} else {
						console.log(JSON.stringify(body));
					}
					callback(err, body);
				});
		}
	};

	return _public;

})();

exports.log = Audit.log;
exports.fetch = Audit.fetch;
