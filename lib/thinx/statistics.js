/*
 * This THiNX-RTM API module is responsible for aggregating daily statistics.
 */

var Statistics = (function() {

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var ROOT = app_config.project_root;

	var LOG_PATH = ROOT + "/../.pm2/logs/index-out-0.log";
	var TEMP_PATH = ROOT + "/statistics/stats.temp";
	var STATS_PATH = ROOT + "/statistics/";

	var mkdirp = require("mkdirp");
	var dateFormat = require("dateformat");
	var fs = require("fs-extra");
	var parse = require("parse-date");

	var once = false;
	var path;
	var exit_callback;
	var parser = null;
	var _owner = null;

	// Create statistics folder if not found on init
	if (!fs.existsSync(STATS_PATH)) {
		console.log("Creating " + STATS_PATH + " from " + __dirname);
		mkdirp(STATS_PATH, function(err) {
			if (err) console.log(err);
			//else console.log(STATS_PATH + ' created.');
		});
	}

	var readline = require("readline");
	var owners = {};

	// Defines data model and also lists known tracked keys
	var owner_stats_template = {
		APIKEY_INVALID: [0],
		LOGIN_INVALID: [0],
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

	// This is called after parse completes. Should return
	// existing pre-parsed file from path or nothing if parser failed.
	function parse_callback(path) {
		if (typeof(exit_callback) !== "function") {
			// exit_callback not set for parse_callback [coule be when called from aggregator]
			return;
		}
		if (fs.existsSync(path)) {
			console.log("[parse_callback] Reading stats from existing: " + path); // FIXME
			fs.readFile(path, "utf-8", function(err, statistics) {
				if (err) {
					console.log("[parse_callback] Read error: " + err);
					exit_callback(false, "error");
					return;
				} else {
					if (!statistics) {
						exit_callback(false, "error");
					} else {
						exit_callback(true, statistics);
					}
				}
				return;
			});
		} else {
			console.log("[parse_callback] Stats file not found at: " + path);
			exit_callback(false, "parse_callback_file_not_found");
			return;
		}
	}

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

			var write = function(path, owner_data) {
				fs.writeFileSync(
					path,
					JSON.stringify(owner_data), {
						encoding: "utf-8",
						flag: "wx",
						mode: 493
					} // 493 == 0755
				);
			};

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
								write(path, owner_data);
							});
						} else {
							write(path, owner_data);
						}
					}
				});
			}
		},

		/**
		 * Performs ETL transaction from current log
		 */

		parse: function(owner, today, completed_callback) {

			if (!fs.existsSync(LOG_PATH)) {
				console.log("[PARSE] THiNX log not found at:" + LOG_PATH);
				return false; // no log found
			}

			fs.copy(LOG_PATH, TEMP_PATH, function(err) {

				if (err !== null) {
					console.log(err);
					return false;
				}

				parser = readline.createInterface({
					input: fs.createReadStream(TEMP_PATH),
					output: null,
					console: false,
					terminal: false
				});

				if ((typeof(parser) === "undefined") && (parser !== null)) {
					console.log("[ERROR][PARSER] could not be instantiated in PARSE!");
					return;
				}

				owners[owner] = owner_stats_template;

				parser.on("line", function(line) {

					if (line.indexOf("[OID:") !== 1) {

						var scanline = line.split("]");

						/* TODO: Use this to parse date... will be used for splitting day to hours
						if (scanline.length > 0) {
							var dtemp = scanline[0].substr(1);
						} */

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

						var d = new Date();
						var dtemp = scanline[0];
						// TODO: convert dtemp to date and skip if not today's
						if (dtemp.indexOf("[") === 0) {
							var stringdate = dtemp.replace("[", "");
							var ld;
							try {
								ld = parse(stringdate);
							} catch (e) {
								return;
							}
							var datestring = ld.getDate() + "-" + (ld.getMonth() + 1) + "-" +
								ld.getFullYear();
							var nowstring = d.getDate() + "-" + (d.getMonth() + 1) + "-" + d
								.getFullYear();
							if (datestring !== nowstring) {
								if (today) {
									console.log("skipping off-date record at " + datestring);
									return;
								}
							}
							//console.log("linedate: " + linedate.toDateString());
						}

						// TODO: Extract as 'owners = updateOwnersWithLine(line)'

						if (line.indexOf("APIKEY_INVALID") != -1) {
							owners[oid].APIKEY_INVALID[0]++;
						} else if (line.indexOf("LOGIN_INVALID") != -1) {
							owners[oid].LOGIN_INVALID[0]++;
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

				parser.on("close", function(line) {
					for (var owner_id in owners) {
						var owner_data = owners[owner_id];
						var dirpath = STATS_PATH + owner_id;
						var path = dirpath + "/" + _public.todayPathElement() + ".json";
						_public.write_stats(false, path, dirpath, owner_data);
					}
					if (typeof(exit_callback) === "function") {
						exit_callback(true, owners[owner_id]);
					}
					if (fs.existsSync(TEMP_PATH)) {
						fs.unlink(TEMP_PATH);
					}
				});
			});
		},

		aggregate: function() {

			if (!fs.existsSync(LOG_PATH)) {
				console.log("[AGGREGATE] THiNX log not found at:" + LOG_PATH);
				return true; // no log found
			}

			fs.copy(LOG_PATH, TEMP_PATH, function(err) {

				if (err) return console.log(err);

				if (err !== null) {
					console.log(err); // FIXME
					return false;
				}

				parser = readline.createInterface({
					input: fs.createReadStream(TEMP_PATH),
					output: null,
					console: false,
					terminal: false
				});

				if ((typeof(parser) === "undefined") || (parser === null)) {
					console.log(
						"[ERROR][PARSER] could not be instantiated in AGGREGATE!");
					return;
				}

				parser.on("line", function(line) {

					if (line.indexOf("[OID:") != 1) {

						// Split by bracket-space first...
						var scanline = line.split("]");

						/* TODO: Use this to parse date... will be used for splitting day to hours
						if (scanline.length > 0) {
							var dtemp = scanline[0].substr(1);
						} */

						var oid =
							"cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12";
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
						} else if (line.indexOf("LOGIN_INVALID") != -1) {
							owners[oid].LOGIN_INVALID[0]++;
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

				parser.on("close", function(line) {
					for (var owner_id in owners) {
						var owner_data = owners[owner_id];
						var dirpath = STATS_PATH + owner_id;
						path = dirpath + "/" + _public.todayPathElement() + ".json";
						_public.write_stats(false, path, dirpath, owner_data);
					}

					if (_owner !== null) {
						path = STATS_PATH + _owner + "/" + _public.todayPathElement() +
							".json";
					}

					// Expects global callback being set already
					if ((typeof(parse_callback) === "function") && parse_callback !==
						null) {
						parse_callback(path);
					}
					if (fs.existsSync(TEMP_PATH)) {
						fs.unlink(TEMP_PATH);
					}
				});
			});
			return true;
		},

		/**
		 * Returns today data created by ETL if available
		 * @param {string} owner - restrict to owner
		 * @param {function} callback (err, statistics) - async return callback, returns statistics or error
		 */

		today: function(owner, callback) {

			exit_callback = callback;
			_owner = owner;

			var xpath = _private.ownerPath(owner) + "/" +
				_public.todayPathElement() + ".json";
			console.log("xpath: " + xpath); // FIXME
			this.path = path;
			path = xpath;

			if (!fs.existsSync(path)) {
				console.log("[STATS] Statistics not found...");
				if (once === false) {
					console.log("[TODAY-N-ONCE] Parsing today data..."); // FIXME
					once = true;
					_public.aggregate();
				} else {
					exit_callback(false, "no_stats_found");
				}
			} else {
				once = false;
				console.log("[STATS] Fetching recent statistics..."); // FIXME
				var today = true;
				_public.parse(owner, today, parse_callback(path));
			}
		},

		/**
		 * Returns weekly data created by ETL if available
		 * @param {string} owner - restrict to owner
		 * @param {function} callback (err, statistics) - async return callback, returns statistics or error
		 */

		week: function(owner, callback) {

			// console.log("[OID:" + owner + "] [STATS_WEEKLY_BAGR]");

			var atLeastOneFileFound = false;

			var results = {};

			for (var d = 7; d > 0; d--) {

				var wpath = _private.ownerPath(owner) + "/" + _public.weekPathElement(
						d) +
					".json";

				if (fs.existsSync(wpath)) {
					atLeastOneFileFound = true;
					var jsonData = fs.readFileSync(wpath);

					var data = JSON.parse(jsonData);

					if (typeof(data) === "undefined") {
						continue;
					}

					var skeys = Object.keys(data);
					for (var kindex in skeys) {
						var keyname = skeys[kindex];
						if (typeof(results[keyname]) === "undefined") {
							results[keyname] = [];
						}
						var keydata = data[keyname][0];
						if (keydata) {
							results[keyname].push(keydata);
						} else {
							results[keyname].push(0);
						}
					}
				}
			}

			callback(atLeastOneFileFound, results);

		},

		todayPathElement: function() {
			var today = dateFormat(new Date(), "isoDate");
			return today;
		},

		weekPathElement: function(daysBack) {
			return dateFormat(new Date((Date.now() - (86400000 * daysBack))),
				"isoDate");
		}

	};

	return _public;

})();

exports.parse = Statistics.parse;
exports.aggregate = Statistics.aggregate;
exports
	.today = Statistics.today;
exports.week = Statistics.week;

// test
exports.todayPathElement = Statistics.todayPathElement;
exports.write_stats =
	Statistics.write_stats;
