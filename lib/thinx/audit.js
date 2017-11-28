/*
 * This THiNX-RTM API module is responsible for audit logging.
 */

var Audit = (function() {

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var db = app_config.database_uri;
	var fs = require("fs");

	var prefix = "";
	try {
		var pfx_path = app_config.project_root + '/conf/.thx_prefix';
		if (fs.existsSync(pfx_path)) {
			prefix = fs.readFileSync(pfx_path) + "_";
		}
	} catch (e) {
		//console.log(e);
	}

	var loglib = require("nano")(db).use(prefix + "managed_logs");

	// public
	var _public = {

		log: function(owner, message, flag = "info") {
			var mtime = new Date();
			var record = {
				"message": message,
				"owner": owner,
				"date": mtime,
				"flags": [flag]
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
			var auditlog = [];
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
						var fallback = item.value.flags;
						if (typeof(fallback) === "undefined") {
							fallback = ["info"];
						}
						auditlog.push({
							date: item.value.date,
							message: item.value.message,
							flags: fallback
						});
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
