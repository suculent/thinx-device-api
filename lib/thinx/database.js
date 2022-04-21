// Database Manager

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const fs = require("fs-extra");
module.exports = class Database {

	constructor() {

		let db_uri;
		let user = process.env.COUCHDB_USER;
		let pass = process.env.COUCHDB_PASS;

		if ((typeof (user) !== "undefined") && (typeof (pass) !== "undefined")) {
			db_uri = `http://${user}:${pass}@couchdb:5984`;
		} else {
			db_uri = app_config.database_uri; // fallback to old config.json; deprecated
			console.log("⛔️ [deprecated] Using database credentials from configuration...");
		}

		this.db_uri = db_uri;
		this.nano = require("nano")(db_uri);

	}

	nano() {
		return this.nano;
	}

	uri() {

		/* duplicate code, happens in constructor and that's enough
		let db_uri;
		let user = process.env.COUCHDB_USER;
		let pass = process.env.COUCHDB_PASS;

		if ((typeof (user) !== "undefined") && (typeof (pass) !== "undefined")) {
			db_uri = `http://${user}:${pass}@couchdb:5984`;
		} else {
			db_uri = app_config.database_uri; // fallback to old config.json; deprecated
			console.log("⛔️ [deprecated] Using database credentials from configuration...");
		}

		this.db_uri = db_uri;
		*/

		return this.db_uri;
	}
	

	null_cb(err, body, header) {
		// only unexpected errors should be logged
		if (process.env.ENVIRONMENT === "test") {
			// The database may already exist.
			if (err.ststusCode !== 412) {
				console.log(err, body, header);
			}
		}
	}

	// Designated initalizer
	init(callback) {

		console.log("ℹ️ [info] Initializing databases...");

		let db_names = [
			"devices", "builds", "users", "logs"
		];

		this.nano.db.list((_err, existing_dbs) => {

			if ((typeof(existing_dbs) === "undefined") || (existing_dbs === null)) existing_dbs = [];

			db_names.forEach((name) => {

				if (existing_dbs.includes(name)) {
					console.log(`ℹ️ [info] DB ${name} already exists.`);
					return;
				}

				const dbprefix = Globals.prefix();

				this.nano.db.create(dbprefix + "managed_" + name).then((/* cerr, data */) => {
					var couch_db = this.nano.db.use(dbprefix + "managed_" + name);
					this.injectDesign(couch_db, name, "/opt/thinx/thinx-device-api/design/design_" + name + ".json");
					this.injectReplFilter(couch_db, "/opt/thinx/thinx-device-api/design/filters_" + name + ".json");
					console.log(`ℹ️ [info] Database managed_${name} initialized.`);
				}).catch((err2) => {
					// returns error normally if DB already exists
					this.handleDatabaseErrors(err2, "managed_" + name, dbprefix);
				});
			});

			this.nano.db.list((err2, new_dbs) => {
				if (typeof (callback) !== "undefined") {
					callback(err2, new_dbs);
				} else {
					return new_dbs;
				}
			});

			setTimeout(() => {
				setInterval(this.compactDatabases, 3600 * 1000); // Compact databases once an hour	
			}, 30000);
			
		});
	}

	compactDatabases(opt_callback) {
		const prefix = Globals.prefix();
		let db_uri = new Database().uri();
		this.nano = require("nano")(db_uri);
		this.nano.db.compact(prefix + "managed_logs")
		.then(() => {
			this.nano.db.compact(prefix + "managed_builds");
		}).then(() => {
			this.nano.db.compact(prefix + "managed_devices");
		}).then(() => {
			this.nano.db.compact(prefix + "managed_users");
		}).then((r) => {
			console.log("managed users compact r", r);
			if (typeof (opt_callback) !== "undefined") opt_callback(err ? err : true);
		}).catch(e => {
			console.log("InitDB error", e);
			if (typeof (opt_callback) !== "undefined") opt_callback(e);
		});
	}

	// Database preparation on first run
	getDocument(file) {
		if (!fs.existsSync(file)) {
			console.log("☣️ [error] Initializing replication filter failed, file does not exist", file);
			return false;
		}
		const data = fs.readFileSync(file);
		if (typeof (data) === "undefined") {
			console.log("☣️ [error] [getDocument] no data read.");
			return false;
		}
		// Parser may fail
		try {
			return JSON.parse(data);
		} catch (e) {
			console.log("☣️ [error] Document File may not exist: " + e);
			return false;
		}
	}

	logCouchError(err, body, header, tag) {
		if (err !== null) {
			if (err.toString().indexOf("conflict") === -1) {
				console.log("☣️ [error] Couch Init error: ", err, body, header, tag);
			}
			if (err.toString().indexOf("ENOTFOUND") !== -1) {
				console.log("Critical DB integration error, exiting.");
				process.exit(1);
			}
		} else {
			return;
		}
		if (typeof (body) !== "undefined") {
			console.log("☣️ [error] Log Couch Insert body: " + body + " " + tag);
		}
		if (typeof (header) !== "undefined") {
			console.log("☣️ [error] Log Couchd Insert header: " + header + " " + tag);
		}
	}

	injectDesign(db, design, file) {
		if (typeof (design) === "undefined") return;
		let design_doc = this.getDocument(file);
		if (design_doc != null) {
			db.insert(design_doc, "_design/" + design, (err, body, header) => {
				this.logCouchError(err, body, header, "init:design:" + design); // returns if no err
			});
		} else {
			console.log("☣️ [error] Design doc injection issue at " + file);
		}
	}

	injectReplFilter(db, file) {
		let filter_doc = this.getDocument(file);
		if (filter_doc !== false) {
			db.insert(filter_doc, "_design/repl_filters", (err, body, header) => {
				this.logCouchError(err, body, header, "init:repl:" + JSON.stringify(filter_doc)); // returns if no err
			});
		} else {
			console.log("☣️ [error] Filter doc injection issue (no doc) at " + file);
		}
	}

	handleDatabaseErrors(err, name, info) {
		if (err.toString().indexOf("the file already exists") !== -1) {
			// silently fail, this is ok
		} else if (err.toString().indexOf("error happened") !== -1) {
			console.log("🚫 [critical] Database connectivity issue. " + err.toString());
			// give some time for DB to wake up until next try, also prevents too fast restarts...
			setTimeout(() => {
				process.exit(1);
			}, 1000);
		} else {
			console.log("🚫 [critical] Database " + name + " creation failed. " + err, " info:", info);
			setTimeout(() => {
				process.exit(2);
			}, 1000);
		}
	}
};