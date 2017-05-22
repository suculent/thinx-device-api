/*
 * This THiNX-RTM API module is responsible for audit logging.
 */

var Audit = (function() {

	var util = require("util");

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);
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
				}
			});
		},

		fetch: function(owner, callback) {
			console.log("FIXME2: fetching audit log for owner: " + owner);
			loglib.view("logs", "logs_by_owner", {
				//"key": owner,
				"limit": 20,
				"include_docs": true
			}, function(err, body) {
				if (err) {
					console.log(err);
					callback(err, body);
				} else {
					console.log("audit log fetched: " + JSON.stringify(body));
					callback(false, body);
				}
			});
		}
	};

	return _public;

})();

exports.log = Audit.log;
exports.fetch = Audit.fetch;
