/*
 * This THiNX-RTM API module is responsible for audit logging.
 */

var Audit = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var fs = require("fs");
	var prefix = fs.readFileSync(app_config.project_root + '/conf/.thx_prefix') ? fs.readFileSync(
		app_config.project_root + '/conf/.thx_prefix') + "_" : "";
	var loglib = require("nano")(db).use(prefix + "managed_logs");

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
			var auditlog = {};
			loglib.view("logs", "logs_by_owner", {
				//"key": owner, returns nothing
				"limit": 100,
				"descending": true
			}, function(err, body) {
				if (err) {
					console.log(err);
					callback(err, body);
				} else {
					for (var index in body.rows) {
						var item = body.rows[index];
						if (item.value.owner.indexOf(owner) === -1) {
							continue;
						}
						auditlog[item.value.date] = item.value.message;
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
