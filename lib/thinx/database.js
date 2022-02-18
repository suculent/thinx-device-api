// Database Manager

var Globals = require("./globals.js");

module.exports = class Database {

	constructor() {
		console.log("[info] Will init DBs...");
		this.nano = require("nano")(Globals.app_config().database_uri);
		console.log("[info] Will access DBs...");
	}

	nano() {
		return this.nano;
	}

	null_cb(err, body, header) {
		// only unexpected errors should be logged
		if (process.env.ENVIRONMENT === "test") {
			console.log(err, body, header);
		}
	}

	// Designated initalizer
	init(callback) {

		const dbprefix = Globals.prefix();

		console.log("[info] Initializing databases...");

		// only to fix bug in CouchDB 2.3.1 first-run
		this.nano.db.create("_users", this.null_cb);
		this.nano.db.create("_stats", this.null_cb);
		this.nano.db.create("_replicator", this.null_cb);
		this.nano.db.create("_global_changes", this.null_cb);

		const db_names = [
			"devices", "builds", "users", "logs"
		];

		db_names.forEach((name) => {
			console.log("[info] Creating database", name);
			// TODO: Get DB before creating to prevent unneccessary logic errors.
			this.nano.db.create(dbprefix + "managed_" + name).then((body) => {
				console.log(body);
				var couch_db = this.nano.db.use(dbprefix + "managed_" + name);
				this.injectDesign(couch_db, name, "./design/design_" + name + ".json");
				this.injectReplFilter(couch_db, "./design/filters_" + name + ".json");
				console.log("[info] managed_" + name + " db is ready now.");
			}).catch((err) => {
				this.handleDatabaseErrors(err, "managed_" + name);
			});
		}).then(() => {
			if (typeof(callback) !== "undefined") callback();
		});

	}

	// Database preparation on first run
	getDocument(file) {
		if (!fs.existsSync(file)) {
			return false;
		}
		const data = fs.readFileSync(file);
		if (typeof (data) === "undefined") {
			console.log("» [getDocument] no data read.");
			return false;
		}
		// Parser may fail
		try {
			return JSON.parse(data);
		} catch (e) {
			console.log("» Document File may not exist: " + e);
			return false;
		}
	}

	logCouchError(err, body, header, tag) {
		if (err !== null) {
			if (err.toString().indexOf("conflict") === -1) {
				console.log("[error] Couch Init error: ", err, body, header, tag);
			}
			if (err.toString().indexOf("ENOTFOUND") !== -1) {
				console.log("Critical DB integration error, exiting.");
				process.exit(1);
			}
		} else {
			return;
		}
		if (typeof (body) !== "undefined") {
			console.log("[error] Log Couch Insert body: " + body + " " + tag);
		}
		if (typeof (header) !== "undefined") {
			console.log("[error] Log Couchd Insert header: " + header + " " + tag);
		}
	}

	injectDesign(db, design, file) {
		if (typeof (design) === "undefined") return;
		let design_doc = this.getDocument(file);
		if (design_doc != null) {
			db.insert(design_doc, "_design/" + design, (err, body, header) => {
				logCouchError(err, body, header, "init:design:" + JSON.stringify(design)); // returns if no err
			});
		} else {
			console.log("[error] Design doc injection issue at " + file);
		}
	}

	injectReplFilter(db, file) {
		let filter_doc = this.getDocument(file);
		if (filter_doc !== false) {
			db.insert(filter_doc, "_design/repl_filters", (err, body, header) => {
				logCouchError(err, body, header, "init:repl:" + JSON.stringify(filter_doc)); // returns if no err
			});
		} else {
			console.log("[error] Filter doc injection issue (no doc) at " + file);
		}
	}

	handleDatabaseErrors(err, name) {
		if (err.toString().indexOf("the file already exists") !== -1) {
			// silently fail, this is ok
		} else if (err.toString().indexOf("error happened") !== -1) {
			console.log("[CRITICAL] 🚫 Database connectivity issue. " + err.toString() + " URI: " + app_config.database_uri);
			// give some time for DB to wake up until next try, also prevents too fast restarts...
			setTimeout(() => {
				process.exit(1);
			}, 1000);
		} else {
			console.log("[CRITICAL] 🚫 Database " + name + " creation failed. " + err + " URI: " + app_config.database_uri);
			setTimeout(() => {
				process.exit(2);
			}, 1000);
		}
	}
};