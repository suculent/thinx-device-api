/** This THiNX-RTM API module is responsible for build logging. */

// #esversion: 6

var Buildlog = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);

	var fs = require("fs");
	var err_callback;

	var readline = require('readline');
	var parser;
	var websocket;

	nano.db.create("managed_builds", function(err, body, header) {
		if (err.statusCode != 412) {
			console.log("[BUILD] db error " + err);
		}
	});

	var buildlib = require("nano")(db).use("managed_builds");

	var _private = {
		pathForOwner: function(owner) {
			var user_path = app_config.build_root + "/" + owner;
			return user_path;
		}
	};

	// public
	var _public = {

		/**
		 * Store new record in build log
		 * @param {string} build_id - UUID of the build
		 * @param {string} owner - 'owner' id of the build owner
		 * @param {string} udid - UDID of the target device
		 * @param {string} message - build log status message
		 */

		log: function(build_id, owner, udid, message, contents) {

			var mtime = new Date();

			var record = {
				"message": message,
				"udid": udid,
				"date": mtime,
				"build": build_id
			};

			if (typeof(contents) !== "undefined") {
				record.contents = contents;
			}

			buildlib.get(build_id, function(err, existing) {

				if (err) {

					var new_records = {
						timestamp: new Date(),
						owner: owner,
						build_id: build_id,
						udid: udid,
						log: [record]
					};

					buildlib.insert(new_records, build_id, function(err,
						body, header) {
						if (err) {
							console.log("[OID:" + owner +
								"] [BUILD_FAIL] new error build-log (" +
								build_id + "): " + err);
						} else {
							if (body.ok !== true) {
								return;
								//console.log(JSON.stringify(body));
								//console.log(JSON.stringify(record));
							}
						}
					});

				} else {

					//console.log("Existing build: " + JSON.stringify(existing));

					buildlib.destroy(existing._id, existing._rev, function(err) {

						if (err) {
							console.log(err);
						}

						delete existing._rev;

						if (typeof(existing) === "undefined") {
							existing = {};
						}

						if (typeof(existing.log) === "undefined") {
							existing.log = {};
						}

						if (typeof(existing.log.records) === "undefined") {
							existing.log.records = [];
						}

						existing.log.records.push(record);

						buildlib.insert(existing, existing._id, function(err,
							body, header) {
							if (err) {
								console.log("[OID:" + owner +
									"] [BUILD_FAIL] new existing build-log (" + existing._id +
									"): " + err);
								// retry
								if (err.toString().indexOf("Document update conflict.") !== -
									1) {
									console.log("Retry log save...");
									_public.log(build_id, owner, udid, message, contents);
								}
							}
						});
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
					console.log("[build] Error fetching build log...");
					if (err.toString().indexOf("Error: missing") !== -1) {
						callback(false, "error_missing:" + build_id);
					} else {
						callback(false, err);
					}
					return;
				}

				console.log("[DEBUG] Build log body:" + JSON.stringify(body));

				if ((typeof(body.log) === "undefined") || (body.log.count === 0)) {
					console.log("[DEBUG] body has no log...");
					callback(false, {});
					return;
				}

				var blog = body.log[0];

				var path = _public.pathForDevice(blog.owner, blog.udid);
				var build_log_path = path + "/" + build_id + ".log";
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
					//console.log("[build][fetch] returning log: " + JSON.stringify( response));
					callback(false, response);
				} else {
					var short_response = {
						log: log_info
					};
					//console.log("[build][fetch] no log at: " + build_log_path);
					//console.log("[build][fetch] returning short-log: " + JSON.stringify( short_response));
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
			buildlib.view("builds", "builds_by_owner", {
				"key": owner,
				// "limit": 100,
				"include_docs": true
			}, function(err, body) {
				if (err) {
					console.log("[build] Error listing builds for owner...");
					callback(err, {});
				} else {
					//console.log("build-logs: " + JSON.stringify(body));
					callback(null, body);
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

				if (err) {
					console.log("_public.fetch:build_id err: " + JSON.stringify(err));
				} else {
					console.log("logtail: " + JSON.stringify(body));
				}

				if (typeof(body) === "undefined") {
					if (typeof(websocket) !== "undefined" && websocket !== null) {
						try {
							websocket.send(JSON.stringify({
								log: "Sorry, no log records fetched."
							}));
						} catch (e) { /* handle error */ }
					} else {
						console.log("[logtail] no websocket.");
					}
					return;
				}

				console.log("body:" + JSON.stringify(body));

				var build = body.log[0];

				if (err) {
					console.log("[logtail] error: " + err);
				} else {

					console.log("[logtail] fetched build: " + JSON.stringify(build));

					if (typeof(websocket) !== "undefined" && websocket !== null) {
						try {
							websocket.send(JSON.stringify({
								log: {
									message: build.message
								}
							}));
						} catch (e) { /* handle error */
							console.log(e);
						}
					} else {
						console.log("[logtail][head] no websocket.");
					}

					var build_udid = build.udid;
					var path = _public.pathForDevice(owner, build_udid);
					var build_log_path = path + "/" + build_id + "/" + build_id + ".log";

					console.log("Searching for build-log " + build_log_path);

					if (fs.existsSync(build_log_path)) {

						console.log("File " + build_log_path + " found, starting tail...");

						parser = readline.createInterface({
							input: fs.createReadStream(build_log_path),
							output: null,
							console: false,
							terminal: false
						});

						parser.on("line", function(data) {
							var logline = data.toString();

							// skip own logs to prevent loops
							if (logline.indexOf("[logtail]" !== -1)) return;

							console.log("[logtail][line] " + logline);
							if ((logline === "") || (logline === "\n")) return;
							if (typeof(websocket) !== "undefined" && websocket !== null) {
								try {
									websocket.send(logline);
								} catch (e) {
									/* handle error */
									console.log(e);
								}
							} else {
								console.log("[logtail][line] no websocket.");
							}
						});

						parser.on("error", function(error) {
							console.log('ERROR: ', error);
						});

					} else {

						console.log("[DEBUG] Build log not found at: " + build_log_path);

						console.log("[tail][fake][DEBUG] Tailing log in Fake-Mode!");

						parser = readline.createInterface({
							input: fs.createReadStream(app_config.project_root +
								"/../.pm2/logs/index-out-0.log"),
							output: null,
							console: false,
							terminal: false
						});

						parser.on("line", function(logline) {

							//if (logline.indexOf("[logtail]" !== -1)) return;
							//if ((logline === "") || (logline === "\n")) return;

							if (typeof(websocket) !== "undefined" && websocket !== null) {
								try {
									websocket.send(logline);
								} catch (e) {
									/* handle error */
									console.log(e);
								}
							} else {
								console.log("[logtail][line][fake] no websocket.");
							}
						});

						parser.on("error", function(error) {
							console.log('ERROR: ', error);
							if (typeof(err_callback) !== "undefined") {
								err_callback("fake build log error");
							}
						});

					} // file not exists

				} // no error

			}); // build fetch
		},

		pathForDevice: function(owner, udid) {
			this.owner = owner;
			this.udid = udid;
			var user_path = _private.pathForOwner(owner);
			var device_path = user_path + "/" + udid;
			return device_path;
		},

		build: function(args) {
			// TODO: Refactor build code to here... but this class should be named `buildlog`, used by `builder` wrapper instead
		}

	};

	return _public;

})();

exports.log = Buildlog.log;
exports.fetch = Buildlog.fetch;
exports.list = Buildlog.list;
exports.tail = Buildlog.tail;
exports.logtail = Buildlog.logtail;

exports.pathForDevice = Buildlog.pathForDevice;

exports.build = Buildlog.build;
