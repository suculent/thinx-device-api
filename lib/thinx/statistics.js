/**
 * This THiNX-RTM API module is responsible for aggregating daily statistics.
 */

var Statistics = (function() {

	var POLLING_TIMEOUT = 86400 * 1000;
	var LOG_PATH = "/var/log/thinx.log";
	var STATS_PATH = "./statistics/";
	var mkdirp = require('mkdirp');
	var dateFormat = require('dateformat');
	var fs = require('fs');

	var once = false;

	// Create statistics folder if not found on init
	if (!fs.existsSync(STATS_PATH)) {
		mkdirp(STATS_PATH, function(err) {
			if (err) console.error(err);
			else console.log(STATS_PATH + ' created.');
		});
	}

	var readline = require('readline');

	var owner =
		"eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
	var timer = null;

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

		/**
		 * Performs ETL transaction from current log
		 */

		aggregate: function() {

			console.log("AGGREGATE>>>");

			if (!fs.existsSync(LOG_PATH)) {
				console.log("[STATS] THiNX log not found at:" + LOG_PATH);
				return false; // no log found
			}

			fs.readFile(LOG_PATH, 'utf8', function(err, data) {

				if (err) {
					console.log(err);
					return false;
				}

				var parser = readline.createInterface({
					input: fs.createReadStream(LOG_PATH),
					console: false
				});

				parser.on('line', function(line) {

					var owners = {};

					// Defines data model and also lists known tracked keys
					var owner_stats_template = {
						OID: "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
						APIKEY_INVALID: [0],
						PASSWORD_INVALID: [0],
						APIKEY_MISUSE: [0],
						DEVICE_NEW: [0],
						DEVICE_CHECKIN: [0],
						DEVICE_UPDATE_OK: [0], // TODO: not implemented
						DEVICE_UPDATE_FAIL: [0], // TODO: not implemented
						BUILD_STARTED: [0],
						BUILD_SUCCESS: [0],
						BUILD_FAIL: [0]
					};

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
								console.log("Substring at position 3 in :" + otemp);
								oid = otemp.substr(3).replace("[OID:", "");
							}
						}

						owners[oid] = owner_stats_template; // init stat object per owner

						if (line.indexOf("APIKEY_INVALID") != -1) {
							owners[oid].APIKEY_INVALID[0]++;
						}

						if (line.indexOf("PASSWORD_INVALID") != -1) {
							owners[oid].PASSWORD_INVALID[0]++;
						}

						if (line.indexOf("APIKEY_MISUSE") != -1) {
							owners[oid].APIKEY_MISUSE[0]++;
						}

						if (line.indexOf("DEVICE_NEW") != -1) {
							owners[oid].DEVICE_NEW[0]++;
						}

						if (line.indexOf("DEVICE_CHECKIN") != -1) {
							owners[oid].DEVICE_CHECKIN[0]++;
						}

						if (line.indexOf("DEVICE_UPDATE_OK") != -1) {
							owners[oid].DEVICE_UPDATE_OK[0]++;
						}

						if (line.indexOf("DEVICE_UPDATE_FAIL") != -1) {
							owners[oid].DEVICE_UPDATE_FAIL[0]++;
						}

						if (line.indexOf("BUILD_STARTED") != -1) {
							owners[oid].BUILD_STARTED[0]++;
						}

						if (line.indexOf("BUILD_SUCCESS") != -1) {
							owners[oid].BUILD_SUCCESS[0]++;
						}

						if (line.indexOf("BUILD_FAIL") != -1) {
							owners[oid].BUILD_FAIL[0]++;
						}

						var write_stats = function(err, path) {



							if (err) {
								console.log("Write-stats error: " + err);
							} else {

								mkdirp(path, function(err) {

									if (err) {
										console.log("Write-stats mkdirp error: " + err);
									} else {
										fs.writeFileSync(
											path + "/stats.json",
											JSON.stringify(owner_data), {
												encoding: "utf-8",
												flag: "wx",
												mode: 755
											}
										);
									}

								});


							}
						};

						for (var owner_id in owners) {
							var owner_data = owners[owner_id];
							var path = STATS_PATH + owner_id + "/" +
								_public.todayPathElement();
							write_stats(false, path);
							//mkdirp(path, write_stats(err, path));
						}

					} else {
						// line not parseable without OID
						console.log(":: NOT PARSEABLE :: " + line);
					}
				});

				console.log("<<<AGGREGATE");
			});
			return true;
		},

		/**
		 * Returns today data created by ETL if available
		 * @param {string} owner - restrict to owner (EUREKA)
		 * @param {function} callback (err, statistics) - async return callback, returns statistics or error
		 */

		today: function(owner, callback) {

			// TODO: Fetch attributes from file by date if any
			var path = _private.ownerPath(owner) + "/" +
				_public.todayPathElement() + "/stats.json";

			console.log("[STATS] PWD: " + process.env.PWD);
			console.log("[STATS] Seeking at path: " + path);

			if (!fs.existsSync(path)) {
				console.log("[STATS] Today log not found, NOT fetching current data...");
				if (once === false) {
					once = true;
					_public.aggregate();
				}
				return;
			}

			if (fs.existsSync(path)) {
				fs.readFile(path, "utf-8", function(err, statistics) {
					if (err) {
						//console.log(err);
						callback(true, "error");
						return;
					}
					if (!statistics) {
						callback(true, "error");
						return false;
					} else {
						//console.log("Readfile: " + statistics);
						callback(false, statistics);
						return true;
					}
				});
			} else {
				callback(false, "{}");
			}
		},

		todayPathElement: function() {
			var today = dateFormat(new Date(), "isoDate");
			return today;
		}

	};

	return _public;

})();

exports.aggregate = Statistics.aggregate;
exports.today = Statistics.today;

// test
exports.todayPathElement = Statistics.todayPathElement;
