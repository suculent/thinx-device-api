/** This THiNX Device Management API module is responsible for build logging. */

const Globals = require("./globals.js");
const prefix = Globals.prefix();

const Tail = require("tail").Tail;

const Database = require("./database.js");
let db_uri = new Database().uri();
const buildlib = require("./couch")(db_uri).use(prefix + "managed_builds");
const paging = require("./log_paging.js");

var Sanitka = require("./sanitka"); var sanitka = new Sanitka();

const fs = require("fs-extra");
const mkdirp = require("mkdirp");
const chmodr = require('chmodr');

const Filez = require("./files.js");

// todo: refactor to array by owner session
var tail = null;

module.exports = class Buildlog {

	constructor() {

	}

	ab2str(buf) {
		return String.fromCharCode.apply(null, new Uint16Array(buf));
	}

	wsSend(websocket, data) {
		if (typeof (websocket) !== "undefined" && websocket !== null) {
			try {
				websocket.send(data);
			} catch (e) {
				// usually returns 'Error: not opened' when the pipe gets broken
				console.log("[buildlog] socket_error " + e);
			}
		} else {
			console.log("[buildlog] no socket available (in spec) ");
		}
	}

	setupTail(websocket, build_log_path, build_id, terr_callback) {

		var options = {
			fromBeginning: true,
			fsWatchOptions: {},
			separator: /[\r]?\n/,
			follow: true
		};

		if (tail !== null) {
			tail.unwatch();
			tail = null;
		}

		tail = new Tail(build_log_path, options);

		tail.on("line", (data) => {
			var logline = "[" + build_id + "]: " + data;
			if (logline.indexOf("[logtail]") !== -1) return;
			if ((logline === "") || (logline === "\n")) return;
			this.wsSend(websocket, data);
		});

		tail.on("error", (error) => {
			console.log("[tail] ERROR: ", error);
			if (typeof (terr_callback) !== "undefined") {
				terr_callback("fake build log error");
			}
		});

		// hack to start on non-changing files
		tail.watchEvent.call(tail, "change");

		// should return in test only...
		if (process.env.ENVIRONMENT === "test") {
			terr_callback(true, "tail_started");
		}
	}

	// public

	/**
	 * Store new build state
	 * @param {string} build_id - UUID of the build
	 * @param {string} owner - 'owner' id of the build owner
	 * @param {string} udid - UDID of the target device
	 * @param {string} state - build state (start, success, fail)
	 */

	state(build_id, owner, udid, state) {

		if ((typeof (owner) === "undefined") || (owner === null)) {
			console.log("owner undefined");
			return;
		}

		if ((typeof (build_id) === "undefined") || (build_id === null)) {
			console.log("build_id undefined");
			return;
		}

		if ((typeof (udid) === "undefined") || (udid === null)) {
			console.log("udid undefined");
			return;
		}

		if ((typeof (state) === "undefined") || (state === null)) {
			console.log("state undefined");
			return;
		}

		console.log("Attempt to edit log for build_id " + build_id + " with state: '" + state + "'");

		var changes = {
			state: state
		};

		console.log("Changes:", changes);

		// Create or update
		buildlib.get(build_id, (err, existing) => {
			if (err || (typeof (existing) === "undefined")) {
				// initial log record
				let timestamp = new Date().getTime();
				var initial_record = {
					timestamp: timestamp,
					last_update: timestamp,
					start_time: timestamp,
					owner: owner,
					build_id: build_id,
					udid: udid,
					state: state
				};
				console.log("✅ [info] [buildlog] Creating initial log item with state:", state);
				this.createInitialLogRecord(initial_record);
			} else {
				console.log("[buildlog] Updating build log state...");
				// curl -X PUT http://127.0.0.1:5984/database_name/document_id/ -d '{ "field" : "value", "_rev" : "revision id" }'
				buildlib.atomic("builds", "state", build_id, changes, (error1, body1) => {
					if (error1) {
						console.log("blog:state:fail:1", { error1 }, { body1 }, { changes });
						console.log("While atomic editing build-log id '" + build_id + "' state update (existing) error: ", { error1 }, { body1 });
					}
				});
			}
		});
	}

	/**
	 * Store new record in build log
	 * @param {string} build_id - UUID of the build
	 * @param {string} owner - 'owner' id of the build owner
	 * @param {string} udid - UDID of the target device
	 * @param {string} message - build log status message
	 */

	createInitialLogRecord(initial_record, callback) {
		const build_id = initial_record.build_id;

		console.log("✅ [info] [buildlog] Creating initial log record for build_id ", build_id); // , initial_record

		// Store the record AS the document. Wrapping it in `{ log: [record] }`
		// buried every top-level field one level down, so the stored build had
		// no `owner`, `state` or `start_time` of its own. The latest_builds view
		// emits doc.owner and list() drops rows whose doc.owner !== owner, so
		// every build was filtered out and the console showed no build logs at
		// all. It also left log[0].log as a second, nested array, and kept both
		// purgeOwner() (keyed on owner) and the start_time-based pruning from
		// seeing any build.
		buildlib.insert(initial_record, build_id, (insert_error, body /*, header */) => {
			if (insert_error !== null) {
				console.log("[buildlog] insert error: " + insert_error);
			}
			if (typeof(callback) !== "undefined") callback(insert_error, body);
		});
	}

	createAtomicLogRecord(record, callback) {
		const build_id = record.build_id;
		console.log("✅ [info] Appending to atomic log record: " + JSON.stringify(record));
		// log/last_update from timestamp update
		// pushes new record into build log fields (should)
		buildlib.atomic("builds", "log", build_id, { record: record }, (atomic_error, body) => {
			if (atomic_error !== null) {
				console.log("Error while appending atomic log: ", atomic_error, body);
			}
			if (typeof(callback) !== "undefined") callback(atomic_error, body);
		});
	}

	log(build_id, owner, udid, message, contents, callback /* optional */) {

		if (typeof (owner) === "undefined") {
			console.log("Invalid Log owner (is undefined)");
			return;
		}

		let timestamp = new Date().getTime();
		let lastupdate_date = new Date();

		var record = {
			"message": message,
			"udid": udid,
			"timestamp": timestamp,
			"last_update": lastupdate_date,
			"build_id": build_id,
			"contents": ""
		};

		if (typeof (contents) !== "undefined") {
			record.contents = contents;
		}

		// Create or update
		buildlib.get(build_id, (err, existing) => {
			// initial log record
			if (err || (typeof (existing) === "undefined")) {
				var initial_record = {
					timestamp: timestamp,
					last_update: new Date().getTime(),
					start_time: timestamp,
					owner: owner,
					build_id: build_id,
					udid: udid,
					state: "created",
					log: [record]
				};
				this.createInitialLogRecord(initial_record, callback);
			} else {
				// does not seem to be used
				console.log("✅ [info] Creating/appending atomic log record...");
				this.createAtomicLogRecord(record, callback);
			}
		});
	}

	/**
	 * Fetch record from build log
	 * @param {string} build_id - UUID of the build
	 * @param {function} callback (err, body) - async return callback
	 */

	fetch(build_id, callback) {
		this._fetch(build_id, null, callback);
	}

	/**
	 * Fetch record from build log, only if it belongs to owner. Another
	 * owner's build is answered exactly like a missing build, so a build id
	 * cannot be probed for existence.
	 * @param {string} build_id - UUID of the build
	 * @param {string} owner - session owner
	 * @param {function} callback (err, body) - async return callback
	 */
	fetchOwned(build_id, owner, callback) {
		if ((typeof (owner) !== "string") || (owner.length === 0)) {
			return callback(true, Buildlog.missingBuildBody(build_id));
		}
		this._fetch(build_id, owner, callback);
	}

	// The single frame a logtail gets for another owner's build, a missing build
	// or a failed read (quick 261003-v05). All three look identical.
	static get LOGTAIL_NOT_FOUND() {
		return "Sorry, no log records fetched.";
	}

	static missingBuildBody(build_id) {
		return {
			log: [{
				message: "error_missing_build",
				date: new Date().getTime(),
				build: build_id
			}]
		};
	}

	_fetch(build_id, required_owner, callback) {

		buildlib.get(build_id, (err, body) => {

			if (err !== null) {
				if (required_owner !== null) {
					// Owner-checked reads never hand a CouchDB error to the caller: a
					// deleted build, a bad id or a connection failure all read exactly
					// like a missing build (no internal URI, no existence oracle).
					console.log(`[error] [buildlog] fetching build log failed (status ${err.statusCode || err.code})`);
					callback(true, Buildlog.missingBuildBody(build_id));
					return;
				}
				console.log(`[error] [buildlog] fetching build log ${build_id} error ${err}`);
				if (err.toString().indexOf("Error: missing") !== -1) {
					callback(true, Buildlog.missingBuildBody(build_id)); // mocks at least some response instead of error
				} else {
					callback(false, err);
				}
				return;
			}

			// Identity lives at the document root: the build record IS the
			// document. body.log[0] is a log LINE, which carries udid but no
			// owner -- resolving the path from it yields
			// /deploy/undefined/<udid> and build.log is never found. Documents
			// written before the shape fix keep the whole record at log[0], so
			// fall back to that for them.
			var bodykeys = (body.log && typeof (body.log) === "object") ? Object.keys(body.log) : [];
			var blog = (bodykeys.length > 0) ? (body.log[bodykeys[0]] || {}) : {};
			var log_owner = (typeof (body.owner) !== "undefined") ? body.owner : blog.owner;

			if ((required_owner !== null) && (log_owner !== required_owner)) {
				callback(true, Buildlog.missingBuildBody(build_id));
				return;
			}

			if ((typeof (body.log) === "undefined") || (body.log.count === 0)) {
				console.log(`✅ [info] body has no buildlog...`);
				callback(false, {});
				return;
			}

			var log_udid = (typeof (body.udid) !== "undefined") ? body.udid : blog.udid;
			var path = Filez.deployPathForDevice(log_owner, log_udid);
			let bid = sanitka.udid(build_id);
			var build_log_path = path + "/" + bid + "/build.log";

			var log_info = {};
			if (typeof (body.log) !== "undefined") {
				log_info = body.log;
			}
			if (fs.existsSync(build_log_path)) {
				var log_contents = fs.readFileSync(build_log_path);
				var response = {
					log: log_info,
					contents: log_contents
				};
				callback(false, response);
			} else {
				var short_response = {
					log: log_info
				};
				callback(false, short_response);
			}
		});
	}

	/**
	 * Legacy list: the owner's builds of the last 30 days (LOG-02 shape).
	 * Keyed by owner on latest_builds, which emits (doc.owner, doc), so only
	 * flat-shape builds appear, exactly as before. Side-effect free (D-07):
	 * nothing is pruned here any more; expiry belongs to the retention job.
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, body) - async return callback
	 */

	list(owner, callback) {

		if (typeof owner !== "string" || owner.length === 0) {
			callback(false, { rows: [] });
			return;
		}

		buildlib.view("builds", "latest_builds", { key: owner }, (err, body) => {

			if (err) {
				const code = (typeof err.statusCode === "number") ? err.statusCode : "error";
				console.log(`[error] listing builds failed (${code})`);
				callback(true, err.message); // legacy error contract
				return;
			}

			const monthAgo = new Date().getTime() - (30 * 86400 * 1000);
			const documents = (body && Array.isArray(body.rows)) ? body.rows : [];

			// Display filter only. The owner check stays as defence in depth (the
			// former BOLA fix) even though the query is now keyed by owner.
			const owner_logs = documents.filter((row) => {
				const doc = row ? row.value : null;
				if (!doc || doc.owner !== owner) return false;
				return !(doc.start_time < monthAgo);
			});

			callback(false, {
				rows: owner_logs
			});
		});
	}

	/**
	 * LOG-04: one page of the owner's builds, newest first by start_time, over
	 * BOTH document shapes (flat, and nested under log[0]). `owner` comes from
	 * the session only; buildQuery binds both range ends to it. Never prunes.
	 * @param {string} owner - 'owner' id
	 * @param {number} limit - page size (1..200)
	 * @param {object|null} cursor - decoded {k: epoch ms, i: doc id} or null
	 * @param {function} callback (err, {rows, paging}); rows carry `doc`
	 */
	listPage(owner, limit, cursor, callback) {
		const L = (Number.isInteger(limit) && limit > 0) ? Math.min(limit, paging.MAX_LIMIT) : paging.DEFAULT_LIMIT;
		if (typeof owner !== "string" || owner.length === 0) {
			callback(false, { rows: [], paging: { limit: L, has_more: false, next_cursor: null } });
			return;
		}
		const q = paging.buildQuery(owner, L, cursor || null, { include_docs: true });
		buildlib.view("paging", "builds_by_owner_time", q, (err, body) => {
			if (err) {
				const code = (typeof err.statusCode === "number") ? err.statusCode : "error";
				console.log(`[error] build page fetch failed (${code})`);
				callback(err);
				return;
			}
			// Defence in depth on top of the owner-bounded range.
			const rows = ((body && Array.isArray(body.rows)) ? body.rows : [])
				.filter((row) => row && Array.isArray(row.key) && row.key[0] === owner && row.doc);
			const page = paging.pageFromRows(rows, L);
			callback(false, { rows: page.rows, paging: page.paging });
		});
	}

	/**
	 * The legacy build-list item (moved from router.logs getBuildLogs).
	 * A doc with a log array: a shallow copy whose log is reduced to the line
	 * with the highest timestamp. A doc without log: {date, udid}.
	 * The input is never mutated.
	 * @param {object} doc - build document (flat or nested shape)
	 */
	static toBuildListItem(doc) {
		const d = (doc && typeof doc === "object") ? doc : {};
		if (!Array.isArray(d.log)) {
			return {
				date: d.timestamp,
				udid: d.udid,
				build_id: d.build_id || d._id,
				state: d.state,
				start_time: d.start_time || d.timestamp
			};
		}
		let timestamp = 0;
		let latest = d.log[0];
		for (const logline of d.log) {
			if (logline && logline.timestamp > timestamp) {
				latest = logline;
				timestamp = logline.timestamp;
			}
		}
		return Object.assign({}, d, { log: [latest] });
	}

	/**
	 * GDPR #353 / D-18: destroy ALL build documents owned by `owner`, regardless
	 * of age and of document shape. paging/builds_by_owner_time keys both the
	 * flat shape (owner at the root) and the old nested shape (owner under
	 * log[0], ~113 production docs that latest_builds keys as null) by
	 * [owner, time], so the range [owner]..[owner,{}] with include_docs returns
	 * every build of this owner with its _id/_rev. If that view errors (e.g.
	 * not yet installed), fall back to latest_builds {key: owner}, which still
	 * reaches the flat-shape builds.
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, destroyed_count)
	 */
	purgeOwner(owner, callback) {
		if (typeof owner !== "string" || owner.length === 0) return callback(null, 0);
		buildlib.view("paging", "builds_by_owner_time", {
			startkey: [owner], endkey: [owner, {}], include_docs: true
		}, (err, body) => {
			if (err) {
				const code = (typeof err.statusCode === "number") ? err.statusCode : "error";
				console.log(`[warning] owner-keyed build view unavailable (${code}), purging through latest_builds`);
				return this._purgeOwnerLegacy(owner, callback);
			}
			const docs = ((body && Array.isArray(body.rows)) ? body.rows : [])
				.filter((row) => row && Array.isArray(row.key) && row.key[0] === owner)
				.map((row) => row.doc);
			this._destroyAll(docs, callback);
		});
	}

	_purgeOwnerLegacy(owner, callback) {
		buildlib.view("builds", "latest_builds", { "key": owner }, (err, body) => {
			if (err) {
				const code = (typeof err.statusCode === "number") ? err.statusCode : "error";
				console.log(`[error] purging builds failed (${code})`);
				return callback(err, 0);
			}
			const docs = ((body && Array.isArray(body.rows)) ? body.rows : []).map((row) => row ? row.value : null);
			this._destroyAll(docs, callback);
		});
	}

	// Destroys every doc that carries _id and _rev; callback(null, destroyed).
	_destroyAll(docs, callback) {
		let remaining = docs.length;
		let destroyed = 0;
		if (remaining === 0) return callback(null, 0);
		docs.forEach((doc) => {
			if (!doc || !doc._id || !doc._rev) {
				if (--remaining === 0) callback(null, destroyed);
				return;
			}
			buildlib.destroy(doc._id, doc._rev, (derr) => {
				if (!derr) destroyed++;
				else console.log(`[warning] build destroy failed (${(derr && typeof derr.statusCode === "number") ? derr.statusCode : "error"})`);
				if (--remaining === 0) callback(null, destroyed);
			});
		});
	}

	/**
	 * Watch build log
	 * @param {string} build_id - UUID of the build
	 * @param {string} owner - owner of the request/socket
	 * @param {Websocket} socket - socket that will be used as output
	 * @param {function} error_callback (data) - async return callback for line events
	 */

	logtail(unsafe_build_id, owner, socket, error_callback) {

		let build_id = sanitka.udid(unsafe_build_id);

		if (typeof (socket) === "undefined" || socket === null) {
			console.log(`⚠️ [warning] [logtail] Calling logtail without socket...`);
		}

		var websocket = socket;

		if (build_id == null) {
			console.log(`☣️ [error] Tailing invalid log ID ${unsafe_build_id}`);
			error_callback(false);
			return;
		}

		// Quick 261003-v05: the build is read as the caller's owner. Another
		// owner's build, a missing build and a failed read all end here with the
		// same single frame, before any directory, file or tail is touched.
		const verified_owner = (typeof (owner) === "string") ? sanitka.owner(owner) : null;

		this.fetchOwned(build_id, verified_owner, (err, in_body) => {

			const entries = ((err === false) && in_body && Array.isArray(in_body.log)) ? in_body.log : [];
			const build = entries.find((entry) => (typeof (entry) === "object") && (entry !== null) && (sanitka.udid(entry.udid) !== null));

			if (typeof (build) === "undefined") {
				this.wsSend(websocket, Buildlog.LOGTAIL_NOT_FOUND);
				error_callback(false);
				return;
			}

			var message = this.ab2str(build.message);
			this.wsSend(websocket, message);

			var device_path = Filez.deployPathForDevice(verified_owner, sanitka.udid(build.udid));
			var deploy_path = device_path + "/" + sanitka.udid(build_id); // /owner/device/build_id/ == deployment_path

			// Whole build path is created here, because build log is the first thing being written here if nothing else.
			if (!fs.existsSync(deploy_path)) {
				mkdirp.sync(deploy_path);
				console.log(`✅ [info] [logtail] Created deploy_path ${deploy_path}`);
			}

			var build_log_path = deploy_path + "/build.log";

			/* buildlog mocking, returns invalid result in production? */
			if (!fs.existsSync(build_log_path)) {
				console.log("☣️ [error] Log file not found at", build_log_path, ", mocking...");

				const newmask = 0o766;
				const oldmask = process.umask(newmask);
				console.log(`✅ [info] Changed umask from ${oldmask.toString(8)} to ${newmask.toString(8)}`);

				fs.writeFileSync(build_log_path, new Date().toISOString() + " --logfile-created-by-api--\n", { mode: 0o777 }); // read-write by all, execute by nobody; must be writable by worker
				fs.fchmodSync(fs.openSync(build_log_path), 0o665); // lgtm [js/command-line-injection]
			}

			chmodr(deploy_path, 0o776, (cherr) => {

				if (cherr) {
					console.log(`⚠️ [warning] Failed to execute chmodr in buildlog: ${cherr}`);
				}

				if (fs.existsSync(build_log_path)) {
					console.log(`ℹ️ [info] [buildlog] Tailing ${build_log_path}`);
					this.setupTail(websocket, build_log_path, build_id, error_callback);
					return;
				} 
				
				if (typeof (this.websocket) !== "undefined" && this.websocket !== null) {
					try {
						var logline = "Log not found at: " + build_log_path;
						this.websocket.send(logline);
					} catch (e) {
						/* handle error */
						console.log(`[error] [buildlog] ws_send_exception ${e}`);
					}
				} else {
					console.log(`✅ [info] [logtail][line] no websocket.`);
					error_callback(false);
				}
			});
		}
		); // build fetch
	}
};
