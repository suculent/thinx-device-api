/**
 * This THiNX-RTM API module is responsible for aggregating daily statistics.
 */

var Statistics = (function() {

	var app_config = require("../../conf/config.json");
	var ROOT = app_config.project_root;

	var LOG_PATH = ROOT + "/../.pm2/logs/index-out-0.log";
	var TEMP_PATH = ROOT + "/statistics/stats.temp";
	var STATS_PATH = ROOT + "/statistics/";

	var mkdirp = require('mkdirp');
	var dateFormat = require('dateformat');
	var fs = require('fs-extra');

	var once = false;
	var path;
	var exit_callback;
	var parser = null;
	var _owner = null;

	// Create statistics folder if not found on init
	if (!fs.existsSync(STATS_PATH)) {
		mkdirp(STATS_PATH, function(err) {
			if (err) console.error(err);
			//else console.log(STATS_PATH + ' created.');
		});
	}

	var readline = require('readline');
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
			console.log(
				"exit_callback not set for parse_callback [coule be when called from aggregator]"
			);
			return;
		}
		if (fs.existsSync(path)) {
			console.log("[parse_callback] Reading stats from existing: " + path);
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
								//if (err && err.code !== 'ENOENT') throw err;
								write(path, owner_data);
							});
						} else {
							// console.log('[STATS] writing new file...');
							write(path, owner_data);
						}
					}
				});
			}
		},

		/**
		 * Performs ETL transaction from current log
		 */

		parse: function(owner, completed_callback) {

			console.log("[PARSE] Let's get log party started...");

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

				parser.on('line', function(line) {

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

				parser.on('close', function(line) {
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
					console.log("[PARSE] Stop the music and go home.");
				});
			});
		},

		aggregate: function() {

			console.log("[AGGREGATE] >>>");

			if (!fs.existsSync(LOG_PATH)) {
				console.log("[AGGREGATE] THiNX log not found at:" + LOG_PATH);
				return true; // no log found
			}

			fs.copy(LOG_PATH, TEMP_PATH, function(err) {

				if (err) return console.error(err);

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

				if ((typeof(parser) === "undefined") || (parser === null)) {
					console.log(
						"[ERROR][PARSER] could not be instantiated in AGGREGATE!");
					return;
				}

				parser.on('line', function(line) {

					if (line.indexOf("[OID:") != 1) {

						// Split by bracket-space first...
						var scanline = line.split("]");

						/* TODO: Use this to parse date... will be used for splitting day to hours
						if (scanline.length > 0) {
							var dtemp = scanline[0].substr(1);
						} */

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

				parser.on('close', function(line) {
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
					console.log("[AGGREGATE] <<<");
				});
			});
			//});
			return true;
		},

		/**
		 * Returns today data created by ETL if available
		 * @param {string} owner - restrict to owner (EUREKA)
		 * @param {function} callback (err, statistics) - async return callback, returns statistics or error
		 */

		today: function(owner, callback) {

			exit_callback = callback;
			_owner = owner;

			var xpath = _private.ownerPath(owner) + "/" +
				_public.todayPathElement() + ".json";
			console.log("xpath: " + xpath);
			this.path = path;
			path = xpath;

			if (!fs.existsSync(path)) {
				console.log("[STATS] Statistics not found...");
				if (once === false) {
					console.log("[TODAY-N-ONCE] Parsing today data...");
					once = true;
					//_public.parse(owner, parse_callback(path));
					_public.aggregate();
					//_public.parse(owner, parse_callback(path));
				} else {
					exit_callback(false, "no_stats_found");
				}
			} else {
				once = false;
				console.log("[STATS] Fetching recent statistics...");
				_public.parse(owner, parse_callback(path));
				//return;
				//console.log("[TODAY-X] Reading today data from " + path);
				//parse_callback(path);
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
