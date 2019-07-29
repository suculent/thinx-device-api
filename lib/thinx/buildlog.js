/** This THiNX-RTM API module is responsible for build logging. */

var Buildlog = (function() {

	var Globals = require("./globals.js");
  var app_config = Globals.app_config();
	var prefix = Globals.prefix();

	var db = app_config.database_uri;
	var fs = require("fs");
	var exec = require("child_process");
	var mkdirp = require("mkdirp");

	var tail = null;
	var err_callback = null;
	var websocket = null;

	Tail = require("tail").Tail;

	var buildlib = require("nano")(db).use(prefix + "managed_builds");

	function ab2str(buf) {
		return String.fromCharCode.apply(null, new Uint16Array(buf));
	}

	var _private = {

		// real-life log path example:
		// /root/thinx-device-api/data/cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12/f8e88e40-43c8-11e7-9ad3-b7281c2b9610/08880d80-5db4-11e7-bc78-f76a3906007e/08880d80-5db4-11e7-bc78-f76a3906007e.log

		deployPathForOwner: function(owner) {
			var user_path = app_config.data_root + app_config.deploy_root + "/" +
				owner;
			return user_path;
		}
	};

	// public
	var _public = {

		/**
		 * Store new build state
		 * @param {string} build_id - UUID of the build
		 * @param {string} owner - 'owner' id of the build owner
		 * @param {string} udid - UDID of the target device
		 * @param {string} state - build state (start, success, fail)
		 */

		state: function(build_id, owner, udid, state) {

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
			buildlib.atomic("builds", "edit", build_id, changes, function(error, body) {
				if (error) {
					console.log("Eating build-log id '" + build_id + "' state update (existing) error: " + JSON.stringify(error));
				}
			});
		},

		/**
		 * Store new record in build log
		 * @param {string} build_id - UUID of the build
		 * @param {string} owner - 'owner' id of the build owner
		 * @param {string} udid - UDID of the target device
		 * @param {string} message - build log status message
		 */

		log: function(build_id, owner, udid, message, contents) {

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
				"build": build_id,
				"contents": ""
			};

			if (typeof(contents) !== "undefined") {
				record.contents = contents;
			}

			// Create or update
			buildlib.get(build_id, function(err, existing) {

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

					console.log("[buildlog] Creating initial log record for build_id "+ build_id); // + JSON.stringify(initial_record));

					buildlib.insert(initial_record, build_id, function(insert_error, body, header) {
						if (insert_error) {
							console.log("[buildlog] insert error: " + insert_error, body);
							buildlib.atomic("builds", "log", build_id, record, function(atomic_error,
								body) {
								if (atomic_error) {
									console.log("Log update (existing) error: " + atomic_error + " :: " + JSON.stringify(
										body));
								} else {
									console.log("Log updated successfully.");
								}
							});
						}
					});


				} else {

					console.log("Creating atomic log record (build_id exists): " + JSON.stringify(record));

					// log/last_update from timestamp update
					buildlib.atomic("builds", "log", build_id, {
						record: record
					}, function(atomic_error, body) {
						if (atomic_error) {
							console.log("Log update (existing) error: " + atomic_error + " :: " + JSON.stringify(
								body));
						} else {
							console.log("Log updated successfully.");
						}
					});
				}
			});
		},

		/**
		 * Fetch record from build log
		 * @param {string} build_id - UUID of the build
		 * @param {function} callback (err, body) - async return callback
		 */

		fetch: function(build_id, callback) {

			buildlib.get(build_id, function(err, body) {

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
				var path = _public.pathForDevice(blog.owner, blog.udid);
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
		},

		/**
		 * List build logs
		 * @param {string} owner - 'owner' id
		 * @param {function} callback (err, body) - async return callback
		 */

		list: function(owner, callback) {
			// returns builds by last update...
			buildlib.view("builds", "latest_builds", {
				"limit": 100,
				//"key": owner,
				"descending": true
			}, function(err, body) {
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
		},

		/**
		 * Watch build log
		 * @param {string} build_id - UUID of the build
		 * @param {string} owner - owner of the request/socket
		 * @param {Websocket} socket - socket that will be used as output
		 * @param {function} err_callback (data) - async return callback for line events
		 */

		logtail: function(build_id, owner, socket, error_callback) {

			websocket = socket;

			if (typeof(error_callback) !== "undefined") {
				err_callback = error_callback;
			}

			_public.fetch(build_id, function(err, body) {

					if (err.toString().indexOf("error") !== -1) {
						console.log("_public.fetch:build_id err: " + JSON.stringify(err));
						return;
					}

					if ((typeof(body) === "undefined") || body === null) {
						if (typeof(websocket) !== "undefined" && websocket !== null) {
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

						var message = ab2str(build.message);

						if (message === "") {
							message = build.message;
						}

						console.log("[buildlog]  fetched build message: " + message);

						if (typeof(websocket) !== "undefined" && websocket !== null) {
							try {
								websocket.send(message);
							} catch (e) { /* handle error */
								console.log("[buildlog] socker_not_opened " + e);
							}
						} else {
							console.log("[buildlog] no websocket.");
						}

						var path = _public.pathForDevice(build.owner, build.udid);
						var build_path = path + "/" + build_id;

						// Whole build path is created here, because build log is the first thing being written here if nothing else.
						if (!fs.existsSync(build_path)) {
							mkdirp.sync(build_path);
							console.log("[buildlog] Created build_path: " + build_path);
						} else {
							console.log("[buildlog] build_path: " + build_path + " already exists.");
						}

						var build_log_path = build_path + "/build.log";

						console.log("[buildlog] Searching for build-log " + build_log_path);

						// Create file before trying to tail, do not wait for builder to do it...
						var PRE = "LOG_DIR=`dirname " + build_log_path +
							"`; [ ! -d $LOG_DIR ] && mkdir -p $LOG_DIR; touch " +
							build_log_path;
						console.log(PRE);
						var presult = exec.execSync(PRE);
						console.log(presult.toString());
						if (fs.existsSync(build_log_path)) {

							console.log("[buildlog] File " + build_log_path + " found, starting tail...");

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

							console.log("[buildlog] Initializing new tail...");
							tail = new Tail(build_log_path, options);

							tail.on("line", function(data) {
								var logline = data.toString();
								if (logline.indexOf("[logtail]") !== -1) return;
								if ((logline === "") || (logline === "\n")) return;
								if (typeof(websocket) !== "undefined" && websocket !== null) {
									try {
										websocket.send(logline);
									} catch (e) {
										// usually returns 'Error: not opened' when the pipe gets broken
										console.log("[buildlog] socker_not_opened " + e);
									}
								} else {
									console.log("[buildlog] no websocket.");
								}
							});

							tail.on("error", function(error) {
								console.log("ERROR: ", error);
								if (typeof(err_callback) !== "undefined") {
									err_callback("fake build log error");
								}
							});

							// hack to start on non-changing files
							tail.watchEvent.call(tail, "change");

						} else {

							if (typeof(websocket) !== "undefined" && websocket !== null) {
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
		},

		pathForDevice: function(owner, udid) {
			this.owner = owner;
			this.udid = udid;
			var user_path = _private.deployPathForOwner(owner);
			var device_path = user_path + "/" + udid;
			return device_path;
		}

	};

	return _public;

})();

exports.state = Buildlog.state;
exports.log = Buildlog.log;
exports.fetch = Buildlog.fetch;
exports.list =
	Buildlog.list;
exports.tail = Buildlog.tail;
exports.logtail = Buildlog.logtail;

exports.pathForDevice = Buildlog.pathForDevice;
