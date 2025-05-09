/*
 * This THiNX Device Management API module is responsible for audit logging.
 */

const Globals = require("./globals.js");
const prefix = Globals.prefix();
const Database = require("./database.js");
const db_uri = new Database().uri();
const loglib = require("nano")(db_uri).use(prefix + "managed_logs");

module.exports = class Audit {

	log(owner, message, flag, callback) {
		if ((typeof (flag) === "undefined") || (flag === null)) {
			flag = "info";
		}
		if ((typeof (message) === "undefined") || (message === null)) {
			console.log("Audit log issue: no message for owner " + owner + " with flag " + flag);
			message = flag;
			flag = "info";
		}
		let mtime = new Date();
		let record = {
			"message": message,
			"owner": owner,
			"date": mtime,
			"flags": [flag]
		};

		loglib.insert(record, mtime, (err/* , body, header */) => {
			const result = (err === null) ? true : false;
			if (!result) {
				console.log("Audit log insertion error: "+err);
			}
			if (typeof(callback) !== "undefined") {
				callback(result);
			}
		});
	}

	fetch(owner, callback) {
		loglib.view("logs", "logs_by_owner", {
			/*"key": owner,*/ "descending": true, "limit": 200
		}, (err, body) => {
			if (err) {
				console.log("[error] Audit Log Fetch Failed", {err});
				callback(err, body);
				return;
			}
			let auditlog = [];
			for (let index in body.rows) {
				let item = body.rows[index];
				if (item.value.owner.indexOf(owner) === -1) continue;
				let flags = item.value.flags;
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
