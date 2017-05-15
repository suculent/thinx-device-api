/**
 * This THiNX-RTM API module is responsible for aggregating daily statistics.
 */

var Statistics = (function() {

	var POLLING_TIMEOUT = 86400 * 1000;
	var LOG_PATH = "/var/log/things.log";
	var STATS_PATH = "../../statistics";
	var mkdirp = require('mkdirp');
	var dateFormat = require('dateformat');
	var fs = require('fs');

	// Create statistics folder if not found on init
	if (!fs.existsSync(STATS_PATH)) {
		mkdirp(STATS_PATH, function(err) {
			if (err) console.error(err);
			else console.log(STATS_PATH + ' created.');
		});
	}

	var readline = require('readline');
	var exec = require("sync-exec");

	var owner = null;
	var timer = null;

	var _private = {

		globalPath: function() {
			return STATS_PATH;
		},

		ownerPath: function(owner) {
			return STATS_PATH + "/" + owner;
		}

	};

	// public
	var _public = {

		/**
		 * Performs ETL transaction from current log
		 */

		aggregate: function() {

			if (!fs.existsSync(LOG_PATH)) {
				console.log("[STATS] THiNX log not found.");
				return false; // no log found
			}

			fs.readFile(LOG_PATH, 'utf8', function(err, data) {

				if (err) {
					console.log(err);
					return false;
				}

				var parser = readline.createInterface({
					input: fs.createReadStream(LOG_PATH),
					output: process.stdout,
					console: false
				});

				parser.on('line', function(line) {

					var owners = {};

					// Defines data model and also lists known tracked keys
					var owner_stats_template = {
						OID: 0,
						APIKEY_INVALID: 0,
						PASSWORD_INVALID: 0,
						APIKEY_MISUSE: 0,
						DEVICE_NEW: 0,
						DEVICE_CHECKIN: 0,
						DEVICE_UPDATE_OK: 0, // TODO: not implemented
						DEVICE_UPDATE_FAIL: 0, // TODO: not implemented
						BUILD_STARTED: 0,
						BUILD_SUCCESS: 0,
						BUILD_FAIL: 0
					};

					if (line.indexOf("[OID:") != 1) {

						// Split by bracked-space first...
						var scanline = line.split("]");

						var date = null;
						if (scanline.length > 0) {
							var dtemp = scanline[0].substr(1);
							date = dtemp;
						}

						var oid = "0";
						if (scanline.length > 2) {
							var otemp = scanline[2];
							if (otemp.indexOf("[OID:") != -1) {
								oid = otemp.substr(3);
							}
						}

						owners[oid] = owner_stats_template; // init stat object per owner

						if (line.indexOf("APIKEY_INVALID") != -1) {
							owners[oid].APIKEY_INVALID++;
						}

						if (line.indexOf("PASSWORD_INVALID") != -1) {
							owners[oid].PASSWORD_INVALID++;
						}

						if (line.indexOf("APIKEY_MISUSE") != -1) {
							owners[oid].APIKEY_MISUSE++;
						}

						if (line.indexOf("DEVICE_NEW") != -1) {
							owners[oid].DEVICE_NEW++;
						}

						if (line.indexOf("DEVICE_CHECKIN") != -1) {
							owners[oid].DEVICE_CHECKIN++;
						}

						if (line.indexOf("DEVICE_UPDATE_OK") != -1) {
							owners[oid].DEVICE_UPDATE_OK++;
						}

						if (line.indexOf("DEVICE_UPDATE_FAIL") != -1) {
							owners[oid].DEVICE_UPDATE_FAIL++;
						}

						if (line.indexOf("BUILD_STARTED") != -1) {
							owners[oid].BUILD_STARTED++;
						}

						if (line.indexOf("BUILD_SUCCESS") != -1) {
							owners[oid].BUILD_SUCCESS++;
						}

						if (line.indexOf("BUILD_FAIL") != -1) {
							owners[oid].BUILD_FAIL++;
						}

						var write_stats = function(err, path) {
							if (err) {
								console.log("Write-stats error: " + err);
							} else {
								console.log("Saving stats: " + path + "/stats.json");
								fs.writeFile(
									path + "/stats.json",
									JSON.stringify(owner_data), {
										encoding: "utf-8",
										flag: "wx",
										mode: 755
									},
									function() {
										// console.log("done!");
									}
								);
							}
						};

						for (var owner_id in owners) {
							var owner_data = owners[owner_id];
							var path = "./statistics/" + owner_id + "/" +
								_public.todayPathElement();
							mkdirp(path, write_stats(err, path));
						}

					} else {
						// line not parseable without OID
					}
				});
				// TODO: Add refresh timer like in Watcher...
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

			console.log("[STATS] Seeking at path: " + path);

			if (!fs.existsSync(path)) {
				console.log("[STATS] Today log not found, fetching current data...");
				_public.aggregate();
			}

			if (fs.existsSync(path)) {
				fs.readFile(path, "ascii", function(err, statistics) {
					if (err) {
						console.log(err);
						callback(false, "error");
						return;
					}
					if (!statistics) {
						callback(false, "error");
						return false;
					} else {
						callback(true, statistics);
						return true;
					}
				});
			} else {
				callback(false, "no_data");
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
