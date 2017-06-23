/*
 * This THiNX-RTM API module is responsible for audit logging.
 */

var Audit = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var loglib = require("nano")(db).use("managed_logs");

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
			loglib.view("logs", "logs_by_owner", {
				"key": owner,
				"limit": 100
			}, function(err, body) {
				if (err) {
					console.log(err);
					callback(err, body);
				} else {
					console.log("audit log fetched: " + JSON.stringify(body));
					var auditlog = [];
					for (var index in body.rows) {
						//if (!body.rows.hasOwnProperty(index)) continue;
						var item = body.rows[index];
						//if (!item.hasOwnProperty("date")) continue;
						//if (!item.hasOwnProperty("message")) continue;
						var line = {
							date: body.rows[index].date,
							message: body.rows[index].message
						};
						auditlog.push(line);
					}
					callback(false, auditlog);
				}
			});
		}
	};

	return _public;

})();

exports.log = Audit.log;
exports.fetch = Audit.fetch;
