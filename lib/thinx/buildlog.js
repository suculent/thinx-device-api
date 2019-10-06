/** This THiNX-RTM API module is responsible for build logging. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var db = app_config.database_uri;
var fs = require("fs-extra");
var exec = require("child_process");
var mkdirp = require("mkdirp");

var tail = null;
var err_callback = null;
var websocket = null;

var Tail = require("tail").Tail;

var buildlib = require("nano")(db).use(prefix + "managed_builds");

module.exports = class Buildlog {

 	ab2str(buf) {
		return String.fromCharCode.apply(null, new Uint16Array(buf));
	}

	wsSend(websocket, data) {
		if (typeof(this.websocket) !== "undefined" && this.websocket !== null) {
			try {
				websocket.send(data);
			} catch (e) {
				// usually returns 'Error: not opened' when the pipe gets broken
				console.log("[buildlog] socker_not_opened " + e);
			}
		} else {
      // console.log("no_socket wsSend debug log: "+data);
    }
	}

	deployPathForOwner(owner) {
		var user_path = app_config.data_root + app_config.deploy_root + "/" + owner;
		return user_path;
	}

	setupTail(build_log_path, err_callback) {
		var options = {
			fromBeginning: true,
			fsWatchOptions: {},
			follow: true
		};

		if (tail !== null) {
			console.log("[buildlog] Unwatching existing tail...");
			tail.unwatch();
			tail = null;
		}

		//console.log("[buildlog] Initializing new tail...");
		tail = new Tail(build_log_path, options);

		tail.on("line", (data) => {
			var logline = data.toString();
			if (logline.indexOf("[logtail]") !== -1) return;
			if ((logline === "") || (logline === "\n")) return;
			this.wsSend(websocket, data);
		});

		tail.on("error", (error) => {
			console.log("ERROR: ", error);
			if (typeof(err_callback) !== "undefined") {
				err_callback("fake build log error");
			}
		});

		// hack to start on non-changing files
		tail.watchEvent.call(tail, "change");

    // should return in test only...
    err_callback(true, "tail_started");
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

		if (typeof(owner) === "undefined") {
			console.log("owner undefined");
			return;
		}

		if (typeof(build_id) === "undefined") {
			console.log("build_id undefined");
			return;
		}

		if (typeof(udid) === "undefined") {
			console.log("udid undefined");
			return;
		}

		if (typeof(state) === "undefined") {
			console.log("state undefined");
			return;
		}

		console.log("Attempt to edit log for build_id " + build_id + " with state: '" + state + "'");

		var changes = {};
		changes.state = state;
		buildlib.atomic("builds", "edit", build_id, changes, (error, body) => {
			if (error) {
				console.log("Eating build-log id '" + build_id + "' state update (existing) error: " + JSON.stringify(error));
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
     console.log("[buildlog] Creating initial log record for build_id "+ build_id); // + JSON.stringify(initial_record));

     buildlib.insert(initial_record, build_id, (insert_error, body, header) => {
       if (insert_error !== null) {
         console.log("[buildlog] insert error: " + insert_error, body);
       }
     });
   }

   createAtomicLogRecord(record) {
     const build_id = record.build_id;
     // console.log("Creating atomic log record: " + JSON.stringify(record));
     // log/last_update from timestamp update
     buildlib.atomic("builds", "log", build_id, { record: record }, (atomic_error, body) => {
       if (atomic_error !== null) {
         console.log("Error while appending atomic log: ", atomic_error, body);
       }
     });
  }

	log(build_id, owner, udid, message, contents) {

		if (typeof(owner) === "undefined") {
			console.log("Invalid Log owner (is undefined)");
			return;
		}

		var mtime = new Date().getTime();

		// TODO: should be simplified, investigate impact.
		var record = {
			"message": message,
			"udid": udid,
			"timestamp": mtime,
			"build_id": build_id,
			"contents": ""
		};

		if (typeof(contents) !== "undefined") {
			record.contents = contents;
		}

		// Create or update
		buildlib.get(build_id, (err, existing) => {
			// initial log record
			if (err || (typeof(existing) === "undefined")) {
				var now = new Date().getTime();
				var initial_record = {
					timestamp: mtime,
					last_update: new Date(),
					start_time: now,
					owner: owner,
					build_id: build_id,
					udid: udid,
					state: "created",
					log: [record]
				};
        this.createInitialLogRecord(initial_record);
			} else {
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

			if (err) {
				console.log("[buildlog] Error fetching build log " + build_id);
				if (err.toString().indexOf("Error: missing") !== -1) {
					callback(false, "error_missing:" + build_id); // FIXME: this is not a standard response, change to JSON
				} else {
					callback(false, err);
				}
				return;
			}

			if ((typeof(body.log) === "undefined") || (body.log.count === 0)) {
				console.log("[buildlog] body has no log...");
				callback(false, {});
				return;
			}

			var bodykeys = Object.keys(body.log);
			var blog = body.log[bodykeys[0]];
			var path = this.pathForDevice(blog.owner, blog.udid);
			var build_log_path = path + "/" + build_id + "/build.log";

			var log_info = {};
			if (typeof(body.log) !== "undefined") {
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
	 * List build logs
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, body) - async return callback
	 */

	list(owner, callback) {
		// returns builds by last update...
		buildlib.view("builds", "latest_builds", {
			"limit": 100,
			//"key": owner,
			"descending": true
		}, (err, body) => {
			if (err) {
				//console.log("[buildlog] Error listing builds for owner...");
				callback(err, {});
			} else {
				/* filtering if needed */
				//console.log("[buildlog] Listing builds for owner...");
				var logs = body.rows;
				var owner_logs = [];
				for (var index in logs) {
					var log = logs[index].value;
					if (log.owner == owner) {
						owner_logs.push(logs[index]);
					}
				}
				//console.log("[buildlog] " + JSON.stringify(owner_logs));
				callback(false, {
					rows: owner_logs
				});
			}
		});
	}

	/**
	 * Watch build log
	 * @param {string} build_id - UUID of the build
	 * @param {string} owner - owner of the request/socket
	 * @param {Websocket} socket - socket that will be used as output
	 * @param {function} err_callback (data) - async return callback for line events
	 */

	logtail(build_id, owner, socket, error_callback) {

    if (typeof(socket) === "undefined") {
      console.log("WARNING: Calling logtail without socket...");
    }

		var websocket = socket;

		if (typeof(error_callback) !== "undefined") {
			err_callback = error_callback;
		}

		this.fetch(build_id, (err, body) => {

				if (err.toString().indexOf("error") !== -1) {
					console.log("fetch:build_id err: " + JSON.stringify(err));
					return;
				}

				if ((typeof(body) === "undefined") || body === null) {
					if (typeof(this.websocket) !== "undefined" && this.websocket !== null) {
						try {
							websocket.send(JSON.stringify({
								log: "Sorry, no log records fetched."
							}));
						} catch (e) { /* handle error */ }
					} else {
						console.log("[logtail] no websocket.");
						err_callback("[logtail] no websocket");
					}
					return;
				}

				if (typeof(body.log) === "undefined") {
					console.log("[logtail] log not found in " + JSON.stringify(body));
					err_callback("[logtail] body not found");
					return;
				}

				if ((typeof(body.log) === "undefined") || body.log === null) {
					body.log = [{
						message: "Waiting for build log...",
						udid: body.udid,
						date: new Date.getTime(),
						build: build_id
					}];
				} else {
					body.log.push({
						message: "Waiting for build log...",
						udid: body.udid,
						date: body.timestamp,
						build: build_id
					});
				}

				var build = body.log[0];

				if (typeof(body.owner) === "undefined") {
					build.owner = owner;
				} else {
					build.owner = body.owner; // invalid case
				}

				if (err) {
					console.log("[logtail] error: " + err);
					err_callback(err);
					return;

				} else {

					var message = this.ab2str(build.message);

					if (message === "") {
						message = build.message;
					}

					// console.log("[buildlog] logtail:  fetched build message: " + message);

					this.wsSend(websocket, message);

					var path = this.pathForDevice(build.owner, build.udid);
					var build_path = path + "/" + build_id;

					// Whole build path is created here, because build log is the first thing being written here if nothing else.
					if (!fs.existsSync(build_path)) {
						mkdirp.sync(build_path);
						console.log("[buildlog] Created build_path: " + build_path);
					} else {
						// in case of test console.log("[buildlog] build_path already exists at: " + build_path);
					}

					var build_log_path = build_path + "/build.log";

					// Create file before trying to tail, do not wait for builder to do it...
					var PRE = "LOG_DIR=`dirname " + build_log_path +
						"`; [ ! -d $LOG_DIR ] && mkdir -p $LOG_DIR; touch " +
						build_log_path;
					// console.log(PRE);
					var presult = exec.execSync(PRE);
					console.log(presult.toString());

					if (fs.existsSync(build_log_path)) {
						//console.log("[buildlog] Tailing " + build_log_path);
						this.setupTail(build_log_path, err_callback);
					} else {

						if (typeof(this.websocket) !== "undefined" && this.websocket !== null) {
							try {
								var logline = "Log not found at: " + build_log_path;
								websocket.send(logline);
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
