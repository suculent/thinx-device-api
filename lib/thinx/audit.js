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
						var item = body.rows[index].value;
						//if (!item.value.hasOwnProperty("date")) continue;
						//if (!item.value.hasOwnProperty("message")) continue;
						console.log("item: " + JSON.stringify(item));
						var line = {
							date: item.date,
							message: item.message
						};
						auditlog.push(line);
					}
					console.log("auditlog: " + JSON.stringify(auditlog));
					callback(false, auditlog);
				}
			});
		}
	};

	return _public;

})();

exports.log = Audit.log;
exports.fetch = Audit.fetch;
