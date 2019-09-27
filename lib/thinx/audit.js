/*
 * This THiNX-RTM API module is responsible for audit logging.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var db = app_config.database_uri;
var loglib = require("nano")(db).use(prefix + "managed_logs");

module.exports = class Audit {

	log(owner, message, flag, callback) {
		if ((typeof(flag) === "undefined") || (flag === null)) {
			 flag = "info";
		}
		if ((typeof(message) === "undefined") || (message === null)) {
			console.log("Audit log issue: nothing to store log(owner, message, flags) for owner " + owner + " with flag " + flag);
			message = flag;
			flag = "info";
		}
		var mtime = new Date();
		var record = {
			"message": message,
			"owner": owner,
			"date": mtime,
			"flags": [flag]
		};

		loglib.insert(record, mtime, (err, body, header) => {
			var result = (err === null) ? true : false;
			if (result == false) {
				console.log("Audit log insertion error: "+err);
			}
			if (typeof(callback) !== "undefined") {
				callback(result);
			}
		});
	}

	fetch(owner, callback) {
		loglib.view("logs", "logs_by_owner", {
			/*"key": owner,*/ "descending": true
		}, (err, body) => {
			if (err) {
				console.log(err);
				callback(err, body);
				return;
			}
			var auditlog = [];
			for (var index in body.rows) {
				var item = body.rows[index];
				if (item.value.owner.indexOf(owner) === -1) continue;
				var flags = item.value.flags;
				if (typeof(flags) === "undefined") {
					flags = ["info"];
				}
				auditlog.push({
					date: item.value.date,
					message: item.value.message,
					flags: flags
				});
			}
			callback(false, auditlog);
		});
	}

};
