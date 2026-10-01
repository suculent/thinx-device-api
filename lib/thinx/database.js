// Database Manager

const Globals = require("./globals.js");
const app_config = Globals.app_config(); // for (deprecated/development) database_uri
const fs = require("fs-extra");
const { readSecret } = require("./secrets.js"); // #418: Docker secrets > env
const DesignUpsert = require("./design_upsert.js"); // LOG-01: rev-aware _design/paging at boot

const Filez = require("./files.js");
let ROOT = Filez.appRoot();
module.exports = class Database {

	constructor() {

		let db_uri;
		// #418 (SEC-CFG-01): prefer /run/secrets/<NAME> (swarm), fall back to env.
		let user = readSecret("COUCHDB_USER");
		let pass = readSecret("COUCHDB_PASS");

		if (user && pass) {
			db_uri = `http://${user}:${pass}@couchdb:5984`; // DB server SHOULD have TLS configured but in this case the communication is internal and protected by Docker network, so it's not a problem.
		} else {
			db_uri = app_config.database_uri; // fallback to old config.json; deprecated
			console.log("⛔️ [deprecated] Using database credentials from configuration:", db_uri);
		}

		this.db_uri = db_uri;
		this.nano = require("./couch")(db_uri);

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
			if (err.statusCode !== 412) {
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

				this.initDatabase(name, dbprefix);
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

	// Per-database body of init(); returns the create promise chain so specs can
	// await it without calling init() (which arms the hourly compaction timer).
	initDatabase(name, dbprefix) {
		return this.nano.db.create(dbprefix + "managed_" + name).then((/* cerr, data */) => {
			let couch_db = this.nano.db.use(dbprefix + "managed_" + name);
			this.injectDesign(couch_db, name, ROOT + "/design/design_" + name + ".json");
			this.injectReplFilter(couch_db, ROOT + "/design/filters_" + name + ".json");
			this.ensureDesignDocs(name, dbprefix).catch(() => { /* never fatal */ });
			console.log(`ℹ️ [info] Database managed_${name} initialized.`);
		}).catch((err2) => {
			// returns error normally if DB already exists; every production boot
			// takes this branch, so the paging design doc is upserted here too.
			if (Database.isAlreadyExists(err2)) {
				this.ensureDesignDocs(name, dbprefix).catch(() => { /* never fatal */ });
			}
			this.handleDatabaseErrors(err2, "managed_" + name, dbprefix);
		});
	}

	static isAlreadyExists(err) {
		if (!err) return false;
		if (err.statusCode === 412) return true;
		try {
			return String(err).indexOf("the file already exists") !== -1;
		} catch (_e) {
			return false;
		}
	}

	// LOG-01: install `_design/paging` (logs and builds only), rev-aware.
	// Never rejects, never exits, never goes through handleDatabaseErrors or
	// logCouchError. Logs one line: db name, action and a reason token only.
	ensureDesignDocs(name, dbprefix) {
		try {
			if (name !== "logs" && name !== "builds") return Promise.resolve(null);
			const db_name = (dbprefix || "") + "managed_" + name;
			const report = (r) => {
				if (r.ok) {
					console.log(`ℹ️ [info] [design-upsert] ${db_name} _design/paging action=${r.action}`);
				} else {
					console.log(`⚠️ [warning] [design-upsert] ${db_name} _design/paging action=${r.action} reason=${r.reason}`);
				}
				return r;
			};
			const doc = DesignUpsert.loadPagingDesign(name);
			if (doc === null) {
				return Promise.resolve(report({ ok: false, action: "skipped", reason: "no_design_file" }));
			}
			return DesignUpsert.ensureDesignDoc(this.nano.db.use(db_name), doc)
				.then(report)
				.catch(() => null);
		} catch (_e) {
			return Promise.resolve(null);
		}
	}

	compactDatabases(opt_callback) {
		const prefix = Globals.prefix();
		let db_uri = new Database().uri();
		this.nano = require("./couch")(db_uri);
		console.log("ℹ️ [info] Starting database compaction...");
		this.nano.db.compact(prefix + "managed_logs")
		.then(() => {
			this.nano.db.compact(prefix + "managed_builds");
		}).then(() => {
			this.nano.db.compact(prefix + "managed_devices");
		}).then(() => {
			this.nano.db.compact(prefix + "managed_users");
		}).then(() => {
			console.log("✅ [info] Database compaction completed successfully.");
			if (typeof (opt_callback) !== "undefined") opt_callback(true);
		}).catch(e => {
			console.log("☣️ [error] compactDatabases error", e);
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