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

	var tail = null;

	Tail = require('tail').Tail;

	nano.db.create("managed_builds", function(err, body, header) {
		if (err.statusCode != 412) {
			console.log("[buildlog] db error " + err);
		}
	});

	var buildlib = require("nano")(db).use("managed_builds");

	function ab2str(buf) {
		return String.fromCharCode.apply(null, new Uint16Array(buf));
	}

	function str2ab(str) {
		var buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
		var bufView = new Uint16Array(buf);
		for (var i = 0, strLen = str.length; i < strLen; i++) {
			bufView[i] = str.charCodeAt(i);
		}
		return buf;
	}

	var _private = {

		// real-life log path example:
		// /root/thinx-device-api/data/cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12/f8e88e40-43c8-11e7-9ad3-b7281c2b9610/08880d80-5db4-11e7-bc78-f76a3906007e/08880d80-5db4-11e7-bc78-f76a3906007e.log

		pathForOwner: function(owner) {
			var user_path = app_config.project_root + app_config.deploy_root + "/" +
				owner;
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

				if (err !== false || (typeof(existing) === "undefined")) {

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
						}
					});

				} else {

					console.log("Destroying/inserting updated log data...");

					buildlib.destroy(existing._id, existing._rev, function(err) {

						if (err) {

							console.log("Log destroy error: " + err);

							if (err.indexOf("Error: deleted") !== -1) {
								console.log("Log save retry...");
								_public.log(build_id, owner, udid, message, contents);
							}

						}

						if (typeof(existing) === "undefined") {
							existing = {};
						} else {
							delete existing._rev;
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
									console.log("[buildlog] Retry log save...");
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
					console.log("[buildlog] Error fetching build log...");
					if (err.toString().indexOf("Error: missing") !== -1) {
						callback(false, "error_missing:" + build_id);
					} else {
						callback(false, err);
					}
					return;
				}

				console.log("[buildlog] Build log body:" + JSON.stringify(body));

				if ((typeof(body.log) === "undefined") || (body.log.count === 0)) {
					console.log("[buildlog] body has no log...");
					callback(false, {});
					return;
				}

				var bodykeys = Object.keys(body.log);
				var blog = body.log[bodykeys[0]];

				var path = _public.pathForDevice(blog.owner, blog.udid);
				var build_log_path = path + "/" + build_id + "/" + build_id + ".log";
				console.log("Searching build log file at " + build_log_path);
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
			buildlib.view("builds", "builds_by_owner", {
				//"key": owner, returns nothing
				"limit": 100,
				"descending": true
			}, function(err, body) {
				if (err) {
					console.log("[buildlog] Error listing builds for owner...");
					callback(err, {});
				} else {
					callback(false, body);
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
						console.log("[logtail] logtail object: " + JSON.stringify(body));
					}

					//var message = body.message.toString('utf8');
					//console.log("Extracted message: " + message);

					if (typeof(body) === "undefined") {
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

					if (body.length === 0) {
						err_callback("[logtail] body not found");
						console.log("[logtail] body not found");
						return;
					}

					/* Sample build log body:
					{
						"_id":"249d8080-60ad-11e7-95c6-21103ab2ec79",
						"_rev":"27-bc82fe5b731ab3b7ebf85e4711af4d07",
						"timestamp":"2017-07-04T11:37:21.916Z",
						"owner":"cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12",
						"build_id":"249d8080-60ad-11e7-95c6-21103ab2ec79",
						"udid":"f8e88e40-43c8-11e7-9ad3-b7281c2b9610",
						"log": [
							{
							  "message":"Build started...",
							  "udid":"f8e88e40-43c8-11e7-9ad3-b7281c2b9610",
							  "date":"2017-07-04T11:37:21.837Z",
							  "build":"249d8080-60ad-11e7-95c6-21103ab2ec79"
						  }
						]
					}
					*/

					if (typeof(body.log) === "undefined") {
						console.log("[logtail] body not found in " + JSON.stringify(body));
						//err_callback("[logtail] body not found");
						//return;
						body.log = [];
						body.log[0] = {
							message: "Waiting for build log...",
							udid: body.udid,
							date: body.timestamp,
							build: body.build_id
						};
					}

					var build = body.log[0];

					if (err) {
						console.log("[logtail] error: " + err);
					} else {

						var message = ab2str(build.message);

						console.log("[logtail] fetched build message: " + message);

						if (typeof(websocket) !== "undefined" && websocket !== null) {
							try {
								websocket.send(message);
							} catch (e) { /* handle error */
								console.log(e);
							}
						} else {
							console.log("[logtail][head] no websocket.");
						}

						var build_udid = build.udid;
						var path = _public.pathForDevice(owner, build_udid);
						var build_log_path = path + "/" + build_id + "/" + build_id +
							".log";

						console.log("Searching for build-log " + build_log_path);

						if (fs.existsSync(build_log_path)) {

							console.log("File " + build_log_path + " found, starting tail...");

							var options = {
								fromBeginning: true,
								fsWatchOptions: {},
								follow: true
							};

							if (tail !== null) {
								console.log("Unwatching existing tail...");
								tail.unwatch();
							}

							tail = new Tail(build_log_path, options);

							tail.on("line", function(data) {
								var logline = data.toString();
								if (logline.indexOf("[logtail]") !== -1) return;
								if ((logline === "") || (logline === "\n")) return;
								if (typeof(websocket) !== "undefined" && websocket !== null) {
									try {
										websocket.send(logline);
									} catch (e) {
										console.log(e);
									}
								} else {
									console.log("[logtail][line] no websocket.");
								}
							});

							this.tail.on("error", function(error) {
								console.log('ERROR: ', error);
								if (typeof(err_callback) !== "undefined") {
									err_callback("fake build log error");
								}
							});

							/*

							parser = readline.createInterface({
								input: fs.createReadStream(build_log_path),
								output: null,
								console: false,
								terminal: false
							});

							parser.on('line', function(data) {
								var logline = data.toString();

								// skip own logs to prevent loops
								if (logline.indexOf("[logtail]") !== -1) return;

								if ((logline === "") || (logline === "\n")) return;
								if (typeof(websocket) !== "undefined" && websocket !== null) {
									try {
										websocket.send(logline);
									} catch (e) {
										console.log(e);
									}
								} else {
									console.log("[logtail][line] no websocket.");
								}
							});

							parser.on("error", function(error) {
								console.log('ERROR: ', error);
								if (typeof(err_callback) !== "undefined") {
									err_callback("fake build log error");
								}
							});

							parser.on('close', function(line) {
								if (typeof(websocket) !== "undefined" && websocket !== null) {
									try {

										console.log("Parser closed, restarting...");

										// This implements the tailing...
										// log file closes often in progress.
										parser = readline.createInterface({
											input: fs.createReadStream(build_log_path),
											output: null,
											console: false,
											terminal: false
										});

									} catch (e) {
										console.log(e);
									}
								} else {
									console.log("[logtail] no websocket on close.");
								}
							});
							*/

						} else {

							if (typeof(websocket) !== "undefined" && websocket !== null) {
								try {
									var logline = "Log not found at: " + build_log_path;
									websocket.send(logline);
								} catch (e) {
									/* handle error */
									console.log(e);
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
exports.list =
	Buildlog.list;
exports.tail = Buildlog.tail;
exports.logtail = Buildlog.logtail;

exports.pathForDevice = Buildlog.pathForDevice;

exports.build = Buildlog.build;
