/** This THiNX-RTM API module is responsible for build logging. */

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const prefix = Globals.prefix();

const Tail = require("tail").Tail;
const buildlib = require("nano")(app_config.database_uri).use(prefix + "managed_builds");

const Sanitka = require("./sanitka");
const sanitka = new Sanitka();

const fs = require("fs-extra");
const mkdirp = require("mkdirp");
const chmodr = require('chmodr');

var tail = null;
var err_callback = null;

module.exports = class Buildlog {

	constructor() {
		console.log("✅ [info] Loaded module: Builder Log");
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
			console.log("[buildlog] no socket available (in test) ");
		}
	}

	deployPathForOwner(owner) {
		return app_config.data_root + app_config.deploy_root + "/" + owner;
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
				console.log("[buildlog] Creating initial log item with state:", state);
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

	createInitialLogRecord(initial_record) {
		const build_id = initial_record.build_id;

		console.log("[buildlog] Creating initial log record for build_id ", build_id); // , initial_record

		buildlib.insert(initial_record, build_id, (insert_error, /* body, header */) => {
			if (insert_error !== null) {
				console.log("[buildlog] insert error: " + insert_error);
			}
		});
	}

	createAtomicLogRecord(record) {
		const build_id = record.build_id;
		console.log("Appending to atomic log record: " + JSON.stringify(record));
		// log/last_update from timestamp update
		// pushes new record into build log fields (should)
		buildlib.atomic("builds", "log", build_id, { record: record }, (atomic_error, body) => {
			if (atomic_error !== null) {
				console.log("Error while appending atomic log: ", atomic_error, body);
			}
		});
	}

	log(build_id, owner, udid, message, contents) {

		if (typeof (owner) === "undefined") {
			console.log("Invalid Log owner (is undefined)");
			return;
		}

		let timestamp = new Date().getTime();
		let lastupdate_date = new Date();

		// TODO: should be simplified, investigate impact.
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
				this.createInitialLogRecord(initial_record);
			} else {
				// does not seem to be used
				console.log("Creating/appending atomic log record...");
				this.createAtomicLogRecord(record);
			}
		});
	}

	/**
	 * Fetch record from build log
	 * @param {string} build_id - UUID of the build
	 * @param {function} callback (err, body) - async return callback
	 */

	fetch(build_id, callback) {

		buildlib.get(build_id, (err, body) => {

			if (err !== null) {
				console.log("[buildlog] Error fetching build log ID ", build_id);
				if (err.toString().indexOf("Error: missing") !== -1) {
					let logbody = {};
					logbody.log = [{
						message: "error_missing_build:" + build_id,
						date: new Date().getTime(),
						build: build_id
					}];
					callback(true, logbody); // mocks at least some response instead of error
				} else {
					callback(false, err);
				}
				return;
			}

			if ((typeof (body.log) === "undefined") || (body.log.count === 0)) {
				console.log("[buildlog] body has no log...");
				callback(false, {});
				return;
			}

			var bodykeys = Object.keys(body.log);
			var blog = body.log[bodykeys[0]];
			var path = this.pathForDevice(blog.owner, blog.udid);
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

	prune(document) {
		if (typeof (document.value) == "undefined") return;
		if (typeof (document.value.rev) == "undefined") return;
		buildlib.destroy(document._id, document.value.rev, (destroy_err) => {
			// ignore result, log only
			console.log("Pruning old log", document._id);
			if (destroy_err) {
				console.log({ destroy_err });
			}
		});
	}

	/**
	 * List build logs sorted by last update
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, body) - async return callback
	 */

	list(owner, callback) {

		buildlib.view("builds", "latest_builds", {
			// "key": owner // ; key is date, that is why it does not work... needs updated design doc
		}, (err, body) => {

			if (err) {
				console.log("[buildlog] Error listing builds for owner", err); // no db shards could be opened?
				callback(true, err.message); // watch this, returns socket in certain edgases
				return;
			}

			const monthAgo = new Date().getTime() - (30 * 86400 * 1000);
			const documents = body.rows;

			let owner_logs = [];

			// Auto-prune old documents
			for (var index in documents) {
				let doc = documents[index].value;
				if (doc.start_time < monthAgo) {
					this.prune(doc);
				} else {
					owner_logs.push(documents[index]);
				}
			}

			callback(false, {
				rows: owner_logs
			});
		});
	}

	/**
	 * Watch build log
	 * @param {string} build_id - UUID of the build
	 * @param {string} owner - owner of the request/socket
	 * @param {Websocket} socket - socket that will be used as output
	 * @param {function} err_callback (data) - async return callback for line events
	 */

	logtail(unsafe_build_id, owner, socket, error_callback) {

		let build_id = sanitka.udid(unsafe_build_id);

		if (typeof (socket) === "undefined" || socket === null) {
			console.log("⚠️ [warning] [logtail] Calling logtail without socket...");
		}

		var websocket = socket;

		if (typeof (error_callback) !== "undefined") {
			err_callback = error_callback;
		}

		if (build_id == null) {
			throw new Error("[error] Tailing invalid log ID", unsafe_build_id);
		}

		this.fetch(build_id, (err, in_body) => {

			if (err.toString().indexOf("error") !== -1) {
				console.log("☣️ [error] [logtail] fetch:build_id err: " + JSON.stringify(err));
				// return; ; do not exit, wait for build log
			}

			let build = {};

			if ((typeof (in_body) === "undefined") || in_body === null) {
				if (typeof (this.websocket) !== "undefined" && this.websocket !== null) {
					try {
						websocket.send(JSON.stringify({
							log: "Sorry, no log records fetched."
						}));
					} catch (e) { /* handle error */ }
				} else {
					console.log("☣️ [error] [logtail] no websocket, exiting...");
					err_callback("[logtail] no websocket");
					return;
				}
			} else {
				if (typeof (in_body.log) === "undefined") {
					console.log("🚫 [critical] passing build in_body: ", in_body, "fetching build_id", build_id);
					build = in_body;
				} else {
					console.log("🚫 [critical] passing build in_body.log: ", in_body.log);
					build = in_body.log[0];
				}
			}

			if (typeof (build.owner) === "undefined") {
				build.owner = sanitka.owner(owner);
			} else {
				build.owner = sanitka.owner(build.owner); // invalid case
			}

			if (err) {
				console.log("[error] ⛔️[logtail]: %s %s", err, in_body);
				err_callback(err);
				return;

			}

			var message = this.ab2str(build.message);
			this.wsSend(websocket, message);

			var device_path = this.pathForDevice(owner, sanitka.udid(build.udid));
			var deploy_path = device_path + "/" + sanitka.udid(build_id); // /owner/device/build_id/ == deployment_path

			// Whole build path is created here, because build log is the first thing being written here if nothing else.
			if (!fs.existsSync(deploy_path)) {
				mkdirp.sync(deploy_path);
				console.log("[logtail] Created deploy_path: " + deploy_path);
			}

			var build_log_path = deploy_path + "/build.log";

			/* buildlog mocking, returns invalid result in production? */
			if (!fs.existsSync(build_log_path)) {
				console.log("☣️ [error] Log file not found at", build_log_path, ", mocking...");

				const newmask = 0o766;
				const oldmask = process.umask(newmask);
				console.log(`Changed umask from ${oldmask.toString(8)} to ${newmask.toString(8)}`);

				fs.writeFileSync(build_log_path, new Date().toISOString() + " --logfile-created-by-api--\n", { mode: 0o777 }); // read-write by all, execute by nobody; must be writable by worker
				fs.fchmodSync(fs.openSync(build_log_path), 0o665); // lgtm [js/command-line-injection]
			}

			chmodr(deploy_path, 0o776, (cherr) => {

				if (cherr) {
					console.log('Failed to execute chmodr', cherr);
				} else {
					console.log("[builder] BUILD_PATH permission change successful.");
				}

				if (fs.existsSync(build_log_path)) {
					console.log("[buildlog] Tailing " + build_log_path);
					this.setupTail(websocket, build_log_path, build_id, err_callback);
				} else {
					if (typeof (this.websocket) !== "undefined" && this.websocket !== null) {
						try {
							var logline = "Log not found at: " + build_log_path;
							this.websocket.send(logline);
						} catch (e) {
							/* handle error */
							console.log("[buildlog] ws_send_exception " + e);
						}
					} else {
						console.log("[logtail][line] no websocket.");
					}
				}
			});
		}
		); // build fetch
	}

	pathForDevice(owner, udid) {
		this.owner = owner;
		this.udid = udid;
		var user_path = this.deployPathForOwner(owner);
		if (user_path) {
			return user_path + "/" + udid;
		} else {
			return false;
		}
	}
};
