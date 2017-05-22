/** This THiNX-RTM API module is responsible for build logging. */

// #esversion: 6

var Build = (function() {

	var util = require("util");

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);

	var deploy = require("./deployment");
	var fs = require("fs");

	Tail = require('tail').Tail;

	nano.db.create("managed_builds", function(err, body, header) {
		if (err.statusCode != 412) {
			console.log("[BUILD] db error " + err);
		}
	});

	var buildlib = require("nano")(db).use("managed_builds");

	var _private = {

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

		log: function(build_id, owner, udid, message) {

			var mtime = new Date();

			var record = {
				"message": message,
				"udid": udid,
				"date": mtime,
				"build": build_id
			};

			buildlib.get(build_id, function(err, existing) {

				if (typeof(existing) === "undefined") {

					var new_records = {
						timestamp: new Date(),
						owner: owner,
						build_id: build_id,
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
								//console.log(JSON.stringify(body));
								//console.log(JSON.stringify(record));
							}
						}
					});

				} else {

					console.log("Existing build: " + JSON.stringify(existing));

					buildlib.destroy(existing._id, existing._rev, function(err) {

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
							} else {
								if (body.ok !== true) {
									console.log("[BUILD_SUCCESS] " + JSON.stringify(body));
									console.log("[BUILD_SUCCESS] " + JSON.stringify(record));
									return;
								} else {
									console.log("[OID:" + owner +
										"] [BUILD_FAIL] appending build-log: " + JSON.stringify(
											record));
									return;
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
					callback(err);
					return;
				}

				//console.log("[DEBUG] Build log body:" + JSON.stringify(body));

				var blog = body.log[0];

				var path = deploy.pathForDevice(blog.owner, blog.udid);
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
					console.log("[build][fetch] returning log: " + JSON.stringify(
						response));
					callback(false, response);
				} else {
					var short_response = {
						log: log_info
					};
					console.log("[build][fetch] no log at: " + build_log_path);
					console.log("[build][fetch] returning short-log: " + JSON.stringify(
						short_response));
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
				"include_docs": true
			}, function(err, body) {
				if (err) {
					console.log("[build] Error listing builds for owner...");
					console.log("[build] " + JSON.stringify(body));
					callback(err, body);
				} else {
					callback(null, body);
				}
			});
		},

		/**
		 * Watch build log
		 * @param {string} build_id - UUID of the build
		 * @param {string} owner - owner of the request/socket
		 * @param {Websocket} websocket - socket that will be used as output
		 * @param {function} err_callback (data) - async return callback for line events
		 */

		logtail: function(build_id, owner, websocket, error_callback) {

			_public.fetch(build_id, function(err, body) {

				//console.log("logtail: " + JSON.stringify(body));

				if (typeof(body) === "undefined") {
					if (typeof(websocket) !== "undefined") {
						try {
							websocket.send(JSON.stringify({
								log: "Sorry, no log found."
							}));
						} catch (e) { /* handle error */ }
					}
					return;
				}

				var build = body.log[0];

				console.log("[logtail] fetched build: " + JSON.stringify(build));
				console.log("[logtail] error: " + err;);

				var build_udid = build.udid;

				if (!err) {
					var path = deploy.pathForDevice(owner, build_udid);
					var build_log_path = path + "/" + build_id + ".log";

					if (fs.existsSync(build_log_path)) {
						//console.log("[tail] found: " + build_log_path);

						var options = {
							separator: /[\r]{0,1}\n/,
							fromBeginning: true,
							follow: true
						};

						tail = new Tail(build_log_path, options);

						tail.on("line", function(data) {
							var logline = data.toString();
							if ((logline === "") || (logline === "\n")) return;
							if (typeof(websocket) !== "undefined") {
								try {
									websocket.send(JSON.stringify({
										log: {
											message: logline
										}
									}));
								} catch (e) { /* handle error */ }
							}
						});

						tail.on("error", function(error) {
							console.log('ERROR: ', error);
							if (typeof(err_callback) !== "undefined") {
								err_callback(error);
							}
						});

					} else {
						console.log("[tail] build log does not exist");
						if (typeof(err_callback) !== "undefined") {
							err_callback("build log does not exist");
						}
					} // file not exists

				} // no error

			}); // build fetch
		}
	};

	return _public;

})();

exports.log = Build.log;
exports.fetch = Build.fetch;
exports.list = Build.list;
exports
	.tail = Build.tail;
exports.logtail = Build.logtail;
