/** This THiNX-RTM API module is responsible for build logging. */

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const prefix = Globals.prefix();

const db = app_config.database_uri;
const Tail = require("tail").Tail;
const buildlib = require("nano")(db).use(prefix + "managed_builds");

const Sanitka = require("./sanitka");
const sanitka = new Sanitka();

const fs = require("fs-extra");
const mkdirp = require("mkdirp");

var tail = null;
var err_callback = null;

module.exports = class Buildlog {

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
		var user_path = app_config.data_root + app_config.deploy_root + "/" + owner;
		return user_path;
	}

	setupTail(websocket, build_log_path, terr_callback) {

		var options = {
			fromBeginning: true,
			fsWatchOptions: {},
			separator: /[\r]{0,1}\n/,
			follow: true
		};

		if (tail !== null) {
			tail.unwatch();
			tail = null;
		}

		tail = new Tail(build_log_path, options);

		tail.on("line", (data) => {
			var logline = data; // data.toString();
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
		console.log("[buildlog] Creating initial log record for build_id " + build_id); // + JSON.stringify(initial_record));

		buildlib.insert(initial_record, build_id, (insert_error, body, header) => {
			if (insert_error !== null) {
				console.log("[buildlog] insert error: " + insert_error, body);
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
				console.log("[buildlog] Creating initial log record...");
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
				console.log("[buildlog] Error fetching build log ID " + build_id);
				if (err.toString().indexOf("Error: missing") !== -1) {
					let logbody = {};
					logbody.log = [{
						message: "error_missing_build:" + build_id,
						date: new Date().getTime(),
						build: build_id
					}];
					callback(false, logbody);
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
			var build_log_path = path + "/" + build_id + "/build.log";

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
	 * List build logs
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, body) - async return callback
	 */

	list(owner, callback) {
		// returns builds by last update...
		buildlib.view("builds", "latest_builds", {
			"key": owner // ; key is date, that is why it does not work... needs updated design doc
		}, (err, body) => {

			if (err) {
				console.log("[buildlog] Error listing builds for owner...");
				callback(err, body);
				return;
			}

			let monthAgo = new Date().getTime() - (30 * 86400 * 1000);
			//let nowMillis = new Date().getTime();
			//console.log("monthAgo: ", monthAgo, "now", nowMillis, "diff", nowMillis - monthAgo);

			/* filtering if needed */
			//console.log("[buildlog] Listing", body.rows.length, "latest builds for owner...");
			var documents = body.rows;
			var owner_logs = [];
			for (var index in documents) {
				var doc = documents[index].value;
				// Auto-prune old documents
				if (doc.start_time < monthAgo) {
					this.prune(doc);
				} else {
					owner_logs.push(documents[index]);
				}
			}

			//console.log("[buildlog] final logs: " + JSON.stringify(owner_logs));
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

		console.log("Logtail called for", owner, unsafe_build_id);

		let build_id = sanitka.udid(unsafe_build_id);

		if (typeof (socket) === "undefined" || socket === null) {
			console.log("[logtail] WARNING: Calling logtail without socket...");
		}

		var websocket = socket;

		if (typeof (error_callback) !== "undefined") {
			err_callback = error_callback;
		}

		build_id = sanitka.udid(build_id);

		this.fetch(build_id, (err, in_body) => {

			if (err.toString().indexOf("error") !== -1) {
				console.log("[logtail] fetch:build_id err: " + JSON.stringify(err));
				// return; ; do not exit, wait for build log
			}

			if ((typeof (in_body) === "undefined") || in_body === null) {
				if (typeof (this.websocket) !== "undefined" && this.websocket !== null) {
					try {
						websocket.send(JSON.stringify({
							log: "Sorry, no log records fetched."
						}));
					} catch (e) { /* handle error */ }
				} else {
					console.log("[logtail] no websocket, exiting...");
					err_callback("[logtail] no websocket");
					return;
				}
				//return; do not exit, wait for build log
			}

			var build = in_body.log[0];

			if (typeof (build.owner) === "undefined") {
				build.owner = sanitka.udid(owner);
			} else {
				build.owner = sanitka.udid(build.owner); // invalid case
			}

			if (err) {
				console.log("[logtail] error: " + err);
				err_callback(err);
				return;

			} else {

				var message = this.ab2str(build.message);
				this.wsSend(websocket, message);

				var device_path = this.pathForDevice(owner, sanitka.udid(build.udid));
				var deploy_path = device_path + "/" + sanitka.branch(build_id); // /owner/device/build_id/ == deployment_path

				// Whole build path is created here, because build log is the first thing being written here if nothing else.
				if (!fs.existsSync(deploy_path)) {
					mkdirp.sync(deploy_path);
					console.log("[logtail] Created deploy_path: " + deploy_path);
				}
				
				var build_log_path = deploy_path + "/build.log";
				/* buildlog mocking, returns invalid result in production?
				if (!fs.existsSync(build_log_path)) {
					console.log("[ERROR] Log file not found at", build_log_path, ", mocking...");
					fs.writeFileSync(build_log_path, "--logfile-not-found--\n", { mode: 0o666 }); // read-write by all, execute by nobody; must be writable by worker
				}
				*/

				if (fs.existsSync(build_log_path)) {
					console.log("[buildlog] Tailing " + build_log_path);
					this.setupTail(websocket, build_log_path, err_callback);
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
			}

		} // no error

		); // build fetch
	}

	pathForDevice(owner, udid) {
		this.owner = owner;
		this.udid = udid;
		var user_path = this.deployPathForOwner(owner);
		if (user_path) {
			var device_path = user_path + "/" + udid;
			return device_path;
		} else {
			return false;
		}
	}
};
