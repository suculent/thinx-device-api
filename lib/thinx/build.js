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

				if (!existing) {

					//console.log("[build] Creating log for build: " + build_id);

					var new_records = {
						owner: owner,
						build_id: build_id,
						log: [record]
					};

					//console.log("[build] Inserting new log with UUID " + build_id + ": " + JSON.stringify(new_records));

					buildlib.insert(new_records, build_id, function(err,
						body, header) {
						if (err) {
							console.log(`[OID:%{oid}] [BUILD_ERROR] new error build-log (` +
								build_id + "): " + err);
						} else {
							if (body.ok !== true) {
								console.log(JSON.stringify(body));
								console.log(JSON.stringify(record));
							} else {
								//console.log("[build] log saved");
							}
						}
					});

				} else {

					console.log("Existing: " + JSON.stringify(existing));

					buildlib.destroy(existing._id, existing._rev, function(err) {

						if (typeof(existing.log) === "undefined") {
							existing.log = {};
						}

						if (typeof(existing.log.records) === "undefined") {
							existing.log.records = [];
						}

						existing.log.records.push(record);

						delete existing._rev;

						buildlib.insert(existing, existing._id, function(err,
							body, header) {
							if (err) {
								console.log(
									`[OID:%{oid}] [BUILD_ERROR] new existing build-log (` +
									existing._id + "): " + err);
							} else {
								if (body.ok !== true) {
									console.log("[BUILD_SUCCESS] " + JSON.stringify(body));
									console.log("[BUILD_SUCCESS] " + JSON.stringify(record));
									return;
								} else {
									console.log("[BUILD_ERR] appending build-log: " + JSON.stringify(
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

			//console.log("[build] Fetching build " + build_id);

			buildlib.get(build_id, function(err, body) {

				if (err) {
					console.log("[build] Error fetching build log...");
					callback(err);
					return;
				}

				//console.log("we need owner & udid: " + JSON.stringify(body.log));

				var blog = body.log[body.log.length - 1];

				var path = deploy.pathForDevice(blog.owner, blog.udid);
				var build_log_path = path + "/" + build_id + ".log";
				//console.log("[build] Fetching " + build_log_path);
				if (fs.existsSync(build_log_path)) {
					var log_contents = fs.readFileSync(build_log_path);
					//console.log("[build] Fetched " + log_contents);
					var response = {
						log: body.log,
						contents: log_contents
					};
					console.log("[build] log fetched: " + JSON.stringify(response));
					callback(null, response);
				} else {
					var short_response = {
						log: body.log
					};
					console.log("[build] short-log fetched: " + JSON.stringify(
						short_response));
					callback(null, short_response);
				}

			});
		},

		/**
		 * List build logs
		 * @param {string} owner - 'owner' id
		 * @param {function} callback (err, body) - async return callback
		 */

		list: function(owner, callback) {
			//console.log("List for owner: " + owner);
			buildlib.view("builds", "builds_by_owner", {
				/* TODO: "key": owner, */
				"include_docs": true
			}, function(err, body) {
				if (err) {
					console.log("[build] Error listing builds for owner...");
					console.log("[build] " + JSON.stringify(body));
					callback(err, body);
				} else {
					//console.log("[build] Listing builds for owner...");
					callback(null, body);
				}
			});
		},

		/**
		 * Watch build log
		 * @param {string} build_id - UUID of the build
		 * @param {function} line_callback (data) - async return callback for line events
		 * @param {function} err_callback (data) - async return callback for line events
		 */

		tail: function(build_id, line_callback, err_callback) {

			_public.fetch(build_id, function(err, body) {

				var build = body;

				// TODO: check
				var build_owner = build.owner;

				// TODO: check
				var build_udid = build.udid;

				if (!err) {

					// console.log("[tail] fetched build: " + JSON.stringify(body));

					var path = deploy.pathForDevice(build_owner, build_udid);
					var build_log_path = path + "/" + build_id + ".log";
					console.log("[tail] Trying " + build_log_path);

					if (fs.existsSync(build_log_path)) {
						console.log("[tail] found: " + build_log_path);

						tail = new Tail(build_log_path);

						tail.on("line", function(data) {
							console.log("[TAIL] " + data);
							if (typeof(line_callback) !== "undefined") {
								line_callback(data);
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
						err_callback("build log does not exist");
					} // file not exists

				} // no error

			}); // build fetch
		},

		logtail: function(build_id, websocket) {

			_public.fetch(build_id, function(err, body) {

				var build = body;

				// TODO: check
				var build_owner = build.owner;

				// TODO: check
				var build_udid = build.udid;

				if (!err) {

					console.log("[tail] fetched build: " + JSON.stringify(body));

					var path = deploy.pathForDevice(build_owner, build_udid);
					var build_log_path = path + "/" + build_id + ".log";
					console.log("[tail] Trying " + build_log_path);

					if (fs.existsSync(build_log_path)) {
						console.log("[tail] found: " + build_log_path);

						tail = new Tail("/var/log/thinx.log"); // FIXME: test only
						// tail = new Tail(build_log_path); production

						tail.on("line", function(data) {
							console.log(data);
							websocket.send(data);
						});

						tail.on("error", function(error) {
							console.log('ERROR: ', error);
							if (typeof(err_callback) !== "undefined") {
								err_callback(error);
							}
						});

					} else {
						console.log("[tail] build log does not exist");
						err_callback("build log does not exist");
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
exports.tail = Build.tail;
exports.logtail = Build.logtail;
