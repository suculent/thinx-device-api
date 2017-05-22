/**
 * This THiNX-RTM API module is responsible for aggregating daily statistics.
 */

var Statistics = (function() {

	var POLLING_TIMEOUT = 86400 * 1000;
	var LOG_PATH = "/var/log/thinx.log";
	var TEMP_PATH = "./statistics/stats.temp";
	var STATS_PATH = "./statistics/";
	var mkdirp = require('mkdirp');
	var dateFormat = require('dateformat');
	var fs = require('fs-extra');

	var once = false;

	var path;
	var exit_callback;

	// Create statistics folder if not found on init
	if (!fs.existsSync(STATS_PATH)) {
		mkdirp(STATS_PATH, function(err) {
			if (err) console.error(err);
			//else console.log(STATS_PATH + ' created.');
		});
	}

	var readline = require('readline');

	// default test owner
	var owner =
		"eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";

	var timer = null;
	var owners = {};

	// Defines data model and also lists known tracked keys
	var owner_stats_template = {
		APIKEY_INVALID: [0],
		PASSWORD_INVALID: [0],
		APIKEY_MISUSE: [0],
		APIKEY_REVOKED: [0],
		DEVICE_NEW: [0],
		DEVICE_CHECKIN: [0],
		DEVICE_UPDATE_OK: [0], // TODO: not implemented
		DEVICE_UPDATE_FAIL: [0], // TODO: not implemented
		DEVICE_REVOCATION: [0],
		BUILD_STARTED: [0],
		BUILD_SUCCESS: [0],
		BUILD_FAIL: [0]
	};

	var _private = {

		globalPath: function() {
			return STATS_PATH;
		},

		ownerPath: function(owner) {
			return STATS_PATH + owner;
		}

	};

	// public
	var _public = {

		write_stats: function(err, path, dirpath, owner_data) {
			if (err) {
				console.log("[WRITE] Write-stats error: " + err);
			} else {
				mkdirp(dirpath, function(err) {
					if (err) {
						console.log("[AGGREGATE] Write-stats mkdirp error: " +
							err);
					} else {
						if (fs.existsSync(path)) {
							fs.unlink(path, function(err) {
								//if (err && err.code !== 'ENOENT') throw err;
								fs.writeFileSync(
									path,
									JSON.stringify(owner_data), {
										encoding: "utf-8",
										flag: "wx",
										mode: 0755
									}
								);
							});
						} else {
							console.log('[WRITE] writing new file...');
							fs.writeFileSync(
								path,
								JSON.stringify(owner_data), {
									encoding: "utf-8",
									flag: "wx",
									mode: 0755
								}
							);
						}
					}
				});
			}
		},

		/**
		 * Performs ETL transaction from current log
		 */

		parse: function(owner, parse_callback) {

			console.log("[PARSE] Let's get log party started...");

			if (!fs.existsSync(LOG_PATH)) {
				console.log("[PARSE] THiNX log not found at:" + LOG_PATH);
				return false; // no log found
			}

			// console.log("[PARSE] Copying log...");

			fs.copy(LOG_PATH, TEMP_PATH, function(err) {

				if (err) return console.error(err);

				// console.log("[PARSE] reading:" + TEMP_PATH);

				if (err !== null) {
					console.log(err);
					return false;
				}

				var parser = readline.createInterface({
					input: fs.createReadStream(TEMP_PATH),
					output: null,
					console: false,
					terminal: false
				});

				owners[owner] = owner_stats_template;

				parser.on('line', function(line) {

					if (line.indexOf("[OID:") !== 1) {

						var scanline = line.split("]");

						var date = null;
						if (scanline.length > 0) {
							var dtemp = scanline[0].substr(1);
							date = dtemp;
						}

						var oid = owner;
						if (scanline.length > 2) {
							var otemp = scanline[2];
							if (otemp.indexOf("[OID:") !== -1) {
								oid = otemp.substr(3).replace("[OID:", "");
								if (oid != owner) {
									return; // untracked OIDs are skipped in this method
								}
							}
						}

						// TODO: Extract as 'owners = updateOwnersWithLine(line)'

						if (line.indexOf("APIKEY_INVALID") != -1) {
							owners[oid].APIKEY_INVALID[0]++;
						} else if (line.indexOf("PASSWORD_INVALID") != -1) {
							owners[oid].PASSWORD_INVALID[0]++;
						} else if (line.indexOf("APIKEY_MISUSE") != -1) {
							owners[oid].APIKEY_MISUSE[0]++;
						} else if (line.indexOf("APIKEY_REVOKED") != -1) {
							owners[oid].APIKEY_REVOKED[0]++;
						} else if (line.indexOf("DEVICE_NEW") != -1) {
							owners[oid].DEVICE_NEW[0]++;
						} else if (line.indexOf("DEVICE_CHECKIN") != -1) {
							owners[oid].DEVICE_CHECKIN[0]++;
						} else if (line.indexOf("DEVICE_UPDATE_OK") != -1) {
							owners[oid].DEVICE_UPDATE_OK[0]++;
						} else if (line.indexOf("DEVICE_UPDATE_FAIL") != -1) {
							owners[oid].DEVICE_UPDATE_FAIL[0]++;
						} else if (line.indexOf("DEVICE_REVOCATION") != -1) {
							owners[oid].DEVICE_REVOCATION[0]++;
						} else if (line.indexOf("BUILD_STARTED") != -1) {
							owners[oid].BUILD_STARTED[0]++;
						} else if (line.indexOf("BUILD_SUCCESS") != -1) {
							owners[oid].BUILD_SUCCESS[0] += 1;
						} else if (line.indexOf("BUILD_FAIL") != -1) {
							owners[oid].BUILD_FAIL[0]++;
						}

					}
				});

				parser.on('close', function(line) {
					for (var owner_id in owners) {
						var owner_data = owners[owner_id];
						var dirpath = STATS_PATH + owner_id;
						path = dirpath + "/" + _public.todayPathElement() + ".json";
						_public.write_stats(false, path, dirpath, owner_data);
					}
					if (typeof(parse_callback) !== "undefined" || parse_callback !==
						null) {
						parse_callback();
					}
					if (fs.existsSync(TEMP_PATH)) {
						fs.unlink(TEMP_PATH);
					}
					console.log("[PARSE] Stop the music and go home.");
				});
			});
		},

		aggregate: function() {

			console.log("AGGREGATE>>>");

			if (!fs.existsSync(LOG_PATH)) {
				console.log("[AGGREGATE] THiNX log not found at:" + LOG_PATH);
				return true; // no log found
			}

			fs.copy(LOG_PATH, TEMP_PATH, function(err) {

				if (err) return console.error(err);

				fs.readFile(TEMP_PATH, 'utf8', function(err, data) {

					if (err) {
						console.log(err);
						return false;
					}

					var parser = readline.createInterface({
						input: fs.createReadStream(TEMP_PATH),
						console: false
					});

					parser.on('line', function(line) {

						if (line.indexOf("[OID:") != 1) {

							// Split by bracked-space first...
							var scanline = line.split("]");

							var date = null;
							if (scanline.length > 0) {
								var dtemp = scanline[0].substr(1);
								date = dtemp;
							}

							var oid =
								"eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
							if (scanline.length > 2) {
								var otemp = scanline[2];
								if (otemp.indexOf("[OID:") != -1) {
									oid = otemp.substr(3).replace("[OID:", "");
								}
							}

							if (typeof(owners[oid]) === "undefined") {
								owners[oid] = owner_stats_template; // init stat object per owner
							}

							if (line.indexOf("APIKEY_INVALID") != -1) {
								owners[oid].APIKEY_INVALID[0]++;
							} else if (line.indexOf("PASSWORD_INVALID") != -1) {
								owners[oid].PASSWORD_INVALID[0]++;
							} else if (line.indexOf("APIKEY_MISUSE") != -1) {
								owners[oid].APIKEY_MISUSE[0]++;
							} else if (line.indexOf("APIKEY_REVOKED") != -1) {
								owners[oid].APIKEY_REVOKED[0]++;
							} else if (line.indexOf("DEVICE_NEW") != -1) {
								owners[oid].DEVICE_NEW[0]++;
							} else if (line.indexOf("DEVICE_CHECKIN") != -1) {
								owners[oid].DEVICE_CHECKIN[0]++;
							} else if (line.indexOf("DEVICE_UPDATE_OK") != -1) {
								owners[oid].DEVICE_UPDATE_OK[0]++;
							} else if (line.indexOf("DEVICE_UPDATE_FAIL") != -1) {
								owners[oid].DEVICE_UPDATE_FAIL[0]++;
							} else if (line.indexOf("DEVICE_REVOCATION") != -1) {
								owners[oid].DEVICE_REVOCATION[0]++;
							} else if (line.indexOf("BUILD_STARTED") != -1) {
								owners[oid].BUILD_STARTED[0]++;
							} else if (line.indexOf("BUILD_SUCCESS") != -1) {
								owners[oid].BUILD_SUCCESS[0] += 1;
							} else if (line.indexOf("BUILD_FAIL") != -1) {
								owners[oid].BUILD_FAIL[0]++;
							}
						}
					});
				});

				parser.on('close', function(line) {
					for (var owner_id in owners) {
						var owner_data = owners[owner_id];
						var dirpath = STATS_PATH + owner_id;
						path = dirpath + "/" + _public.todayPathElement() + ".json";
						_public.write_stats(false, path, dirpath, owner_data);
					}
					if (typeof(parse_callback) !== "undefined" || parse_callback !==
						null) {
						parse_callback();
					}
					if (fs.existsSync(TEMP_PATH)) {
						fs.unlink(TEMP_PATH);
					}
					console.log("<<<AGGREGATE");
				});

			});
			return true;
		},

		/**
		 * Returns today data created by ETL if available
		 * @param {string} owner - restrict to owner (EUREKA)
		 * @param {function} callback (err, statistics) - async return callback, returns statistics or error
		 */

		today: function(owner, callback) {

			exit_callback = callback;

			path = _private.ownerPath(owner) + "/" +
				_public.todayPathElement() + ".json";

			var parse_callback = function() {
				if (fs.existsSync(path)) {

					//console.log("[parse_callback] Reading stats from existing: " + path);

					fs.readFile(path, "utf-8", function(err, statistics) {

						if (err) {
							console.log("[parse_callback] Read error: " +
								err);
							exit_callback(false, "error");
							return;
						}

						console.log("[parse_callback] Reading stats: " +
							statistics);

						if (!statistics) {
							return exit_callback(false, "error");
						} else {
							return exit_callback(true, statistics);
						}
					});
				} else {
					exit_callback(false, "{}");
					return;
				}
			};

			if (!fs.existsSync(path)) {
				console.log("[TODAY-N] Today log not found...");
				if (once === false) {
					console.log("[TODAY-N] Parsing today data...");
					once = true;
					_public.parse(owner, parse_callback);
				}
				return;
			} else {
				console.log("[TODAY-X] Today log found, parsing anyway...");
				_public.parse(owner, parse_callback);
				//return;
				//console.log("[TODAY-X] Reading today data from " + path);
				//parse_callback(path, exit_callback);
			}
		},

		todayPathElement: function() {
			var today = dateFormat(new Date(), "isoDate");
			return today;
		}

	};

	return _public;

})();

exports.parse = Statistics.parse;
exports.aggregate = Statistics.aggregate;
exports.today = Statistics.today;

// test
exports.todayPathElement = Statistics.todayPathElement;
exports.write_stats = Statistics.write_stats;
