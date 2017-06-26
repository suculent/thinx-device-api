/*
 * This THiNX-RTM API module is responsible for audit logging.
 */

var Audit = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var loglib = require("nano")(db).use("managed_logs");

	var Rollbar = require('rollbar');

	var rollbar = new Rollbar({
		accessToken: '5505bac5dc6c4542ba3bd947a150cb55',
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

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
				"limit": 100,
				"descending": true
			}, function(err, body) {
				if (err) {
					console.log(err);
					callback(err, body);
				} else {
					console.log("audit log fetched: " + JSON.stringify(body));
					var auditlog = [];
					for (var index in body.rows) {
						var item = body.rows[index];
						//if (!item.value.hasOwnProperty("date")) continue;
						//if (!item.value.hasOwnProperty("message")) continue;
						console.log("item: " + JSON.stringify(item));
						var line = {
							date: item.date,
							message: item.message
						};
						// TODO: FIXME: Unknown owner Does not even fetch properly...
						//if (item.owner == owner) {
						auditlog.push(item);
						//}
					}
					//console.log("auditlog: " + JSON.stringify(auditlog));
					callback(false, body.rows);
				}
			});
		}
	};

	return _public;

})();

exports.log = Audit.log;
exports.fetch = Audit.fetch;
