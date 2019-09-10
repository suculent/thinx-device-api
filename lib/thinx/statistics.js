/*
 * This THiNX-RTM API module is responsible for aggregating daily statistics.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var mkdirp = require("mkdirp");
var dateFormat = require("dateformat");
var fs = require("fs-extra");
var parse = require("parse-date");
var readline = require("readline");

module.exports = class Statistics {

	constructor() {

		this.ROOT = app_config.project_root;

		// TODO: FIXME: REFACTOR: this is wrong... all events MUST be explicitly routed (e.g. using an event/message queue) through a specific logging class
		this.LOG_PATH = this.ROOT + "/../.pm2/logs/thinx-out.log";
		this.TEMP_PATH = this.ROOT + "/statistics/stats.temp";
		this.STATS_PATH = this.ROOT + "/statistics/";

		this.once = false;
		this.path = "";
		this.exit_callback = null;
		this.parser = null;
		this._owner = null;

		// Create statistics folder if not found on init
		if (!fs.existsSync(this.STATS_PATH)) {
			console.log("Creating " + this.STATS_PATH + " from " + __dirname);
			mkdirp(this.STATS_PATH, function(err) {
				if (err) {
					console.log("mkdirp error");
					console.log(err);
				}
				else console.log(this.STATS_PATH + ' created.');
			});
		}

		// Search different logfile if not found on init
		if (!fs.existsSync(this.LOG_PATH)) {
			this.LOG_PATH = this.ROOT + "/../.pm2/logs/index-out-0.log";
		}

		if (!fs.existsSync(this.LOG_PATH)) {
			this.LOG_PATH = this.ROOT + "/../.pm2/logs/index-out-1.log";
		}

		this.owners = { "4f1122fa074af4dabab76a5205474882c82de33f50ecd962d25d3628cd0603be" : {} }; // test owner only

	}

	get_owner_template() {
		// Defines data model and also lists known tracked keys
		return {
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
	}

	parse_line(owner, line) {
		if (line.indexOf("APIKEY_INVALID") !== -1) {
			owner.APIKEY_INVALID[0]++;
		} else if (line.indexOf("LOGIN_INVALID") !== -1) {
			owner.LOGIN_INVALID[0]++;
		} else if (line.indexOf("APIKEY_MISUSE") !== -1) {
			owner.APIKEY_MISUSE[0]++;
		} else if (line.indexOf("APIKEY_REVOKED") !== -1) {
			owner.APIKEY_REVOKED[0]++;
		} else if (line.indexOf("DEVICE_NEW") !== -1) {
			owner.DEVICE_NEW[0]++;
		} else if (line.indexOf("DEVICE_CHECKIN") !== -1) {
			owner.DEVICE_CHECKIN[0]++;
		} else if (line.indexOf("DEVICE_UPDATE_OK") !== -1) {
			owner.DEVICE_UPDATE_OK[0]++;
		} else if (line.indexOf("DEVICE_UPDATE_FAIL") !== -1) {
			owner.DEVICE_UPDATE_FAIL[0]++;
		} else if (line.indexOf("DEVICE_REVOCATION") !== -1) {
			owner.DEVICE_REVOCATION[0]++;
		} else if (line.indexOf("BUILD_STARTED") !== -1) {
			owner.BUILD_STARTED[0]++;
		} else if (line.indexOf("BUILD_SUCCESS") !== -1) {
			owner.BUILD_SUCCESS[0] += 1;
		} else if (line.indexOf("BUILD_FAIL") !== -1) {
			owner.BUILD_FAIL[0]++;
		}
	}

	closeParsers() {
		console.log("closing parsers...");
		for (var owner_id in this.owners) {
			var owner_data = this.owners[owner_id];
			var dirpath = this.STATS_PATH + owner_id;
			var path = dirpath + "/" + this.todayPathElement() + ".json";
			console.log("parser closed: Writing stats to dirpath '"+dirpath+"'");
			var mkresult = mkdirp(dirpath);
			if (!mkresult) {
				console.log("error creating statistic path for owner: " + err);
			} else {
				try {
					this.write_stats(false, path, dirpath, owner_data);
				} catch (e) {
					console.log("Error saving stats: "+e);
				}
			}
			if (typeof(exit_callback) === "function") {
				this.exit_callback(true, this.owners[owner_id]);
			}
		}
		if (fs.existsSync(this.TEMP_PATH)) {
			fs.unlink(this.TEMP_PATH);
		}
	}

	parse_oid_date_and_line(line) {

		if (line.indexOf("[OID:") === -1) return;

		var scanline = line.split("]");

		// TODO: Use this to parse date... will be used for splitting day to hours
		// if (scanline.length > 0) {
		// var dtemp = scanline[0].substr(1);
		// }

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
			// replaces only first occurence as requested
			var stringdate = dtemp.replace("[", ""); // lgtm [js/incomplete-sanitization]
			var ld;
			try {
				ld = this.parse(stringdate);
			} catch (e) {
				return;
			}
			const date = ld.getDate() + "-" + (ld.getMonth() + 1) + "-" + ld.getFullYear();
			const now = d.getDate() + "-" + (d.getMonth() + 1) + "-" + d .getFullYear();
			if (date !== now) {
				if (today) {
					console.log("skipping off-date record at " + date);
					return;
				}
			}
			//console.log("linedate: " + linedate.toDateString());
		}
		this.parse_line(this.owners[oid], line);
	}

	// This is called after parse completes. Should return
	// existing pre-parsed file from path or nothing if parser failed.
	parse_callback(path) {
		if (typeof(exit_callback) !== "function") {
			// exit_callback not set for parse_callback [coule be when called from aggregator]
			return;
		}
		if (fs.existsSync(path)) {
			console.log("[parse_callback] Reading stats from existing: " + path); // FIXME
			fs.readFile(path, "utf-8", (err, statistics) => {
				if (err) {
					console.log("[parse_callback] Read error: " + err);
					this.exit_callback(false, "error");
					return;
				} else {
					if (!statistics) {
						this.exit_callback(false, "error");
					} else {
						this.exit_callback(true, statistics);
					}
				}
				return;
			});
		} else {
			console.log("[parse_callback] Stats file not found at: " + path);
			this.exit_callback(false, "parse_callback_file_not_found");
			return;
		}
	}

	parse_oid(line) {
		var scanline = line.split("]"); // Split by bracket-space first...
		// TODO: Use this to parse date... will be used for splitting day to hours
		// if (scanline.length > 0) {
		// var dtemp = scanline[0].substr(1);
		// }
		var oid;
		if (scanline.length > 2) {
			var otemp = scanline[2];
			if (otemp.indexOf("[OID:") !== -1) {
				oid = otemp.substr(3).replace("[OID:", "");
			}
		}
		if (typeof(this.owners[oid]) === "undefined") {
			this.owners[oid] = this.get_owner_template(); // init stat object per owner
		}
		this.parse_line(this.owners[oid], line);
	}

	globalPath() {
		return this.STATS_PATH;
	}

	ownerPath(owner) {
		return this.STATS_PATH + owner;
	}

	write(path, owner_data) {
		fs.writeFileSync(
			path,
			JSON.stringify(owner_data), {
				encoding: "utf-8",
				flag: "wx",
				mode: 493
			} // 493 == 0755
		);
	}

	// public

	write_stats(err, path, dirpath, owner_data) {
		if (err) {
			console.log("[WRITE] Write-stats error: " + err);
		} else {
			console.log("Writing stats to owner directory '"+dirpath+"' path " + path);
			let result = mkdirp.sync(dirpath);
			if (result) {
				console.log("[AGGREGATE] Write-stats mkdirp error: " + result);
			} else {
				// Write, delete first if exists
				if (fs.existsSync(path)) {
					fs.unlink(path, (err) => {
						this.write(path, owner_data);
					});
				} else {
					this.write(path, owner_data);
				}
			}
		}
	}

	/**
	* Performs ETL transaction from current log
	*/

	parse(owner, today, completed_callback) {

		if (today) {
			this.today(owner, completed_callback);
			return;
		}

		if (!fs.existsSync(this.LOG_PATH)) {
			console.log("[PARSE] THiNX log not found at:" + this.LOG_PATH);
			completed_callback(false, "log_not_found in " + this.LOG_PATH);
			return;
		}

		fs.copy(this.LOG_PATH, this.TEMP_PATH, (err) => {

			if (err !== null) {
				console.log(err);
				completed_callback(false, err);
				return;
			}

			parser = readline.createInterface({
				input: fs.createReadStream(this.TEMP_PATH),
				output: null,
				console: false,
				terminal: false
			});

			if (typeof(parser) === "undefined") {
				console.log("[ERROR][PARSER] could not be instantiated in PARSE!");
				completed_callback(false, "no_parser");
				return;
			}

			parser.on("line", (line) => {
				this.parse_oid_date_and_line(line);
			});
			parser.on("close", (line) => {
				console.log("Log parser closed.");
				this.closeParsers();
			});

			this.owners[owner] = this.get_owner_template();
		});
	}

	aggregate(callback) {

		console.log("Running aggregate...");

		if (!fs.existsSync(this.LOG_PATH)) {
			console.log("[AGGREGATE] THiNX log not found at:" + this.LOG_PATH);
			if (typeof(callback) !== "undefined") callback(true, "log_not_found at "+this.LOG_PATH); // no success
			return true; // error no log found
		}

		fs.copy(this.LOG_PATH, this.TEMP_PATH, (err) => {

			if (err) {
				console.log(err); // FIXME
				if (typeof(callback) !== "undefined") callback(true, "copy_error "+err); // no success
				return false;
			}

			this.parser = readline.createInterface({
				input: fs.createReadStream(this.TEMP_PATH),
				output: null,
				console: false,
				terminal: false
			});

			if ((typeof(this.parser) === "undefined") || (this.parser === null)) {
				console.log("[ERROR][PARSER] could not be instantiated in AGGREGATE!");
				if (typeof(callback) !== "undefined") callback(true, "parser_error"); // no success
				return false;
			}

			this.parser.on("line", (line) => {
				if (line.indexOf("[OID:") !== -1) {
					this.parse_oid(line);
				}
			});

			this.parser.on("close", (line) => {

				// This looks pretty like a bottleneck.
				for (var owner_id in this.owners) {
					const owner_data = this.owners[owner_id];
					const dirpath = this.STATS_PATH + owner_id;
					var path = dirpath + "/" + this.todayPathElement() + ".json";
					this.path = path; // consumed by global parse_callback after all owners are parsed (last path)
					console.log("aggregate parser closed: Writing stats to dirpath '"+dirpath+"'");
					this.write_stats(false, path, dirpath, owner_data);
				}

				if (this._owner !== null) {
					this.path = this.STATS_PATH + this._owner + "/" + this.todayPathElement() + ".json";
				}

				// Newer callback than parse_callback
				if (typeof(callback) !== "undefined") callback(true, "parser_error"); // no success

				// Expects global callback being set already
				if (typeof(parse_callback) === "function") {
					console.log("returning into parse_callback...");
					this.parse_callback(this.path);
				}
				if (fs.existsSync(this.TEMP_PATH)) {
					fs.unlink(this.TEMP_PATH);
				}
			});
		});
	}

	/**
	* Returns today data created by ETL if available
	* @param {string} owner - restrict to owner
	* @param {function} callback (err, statistics) - async return callback, returns statistics or error
	*/

	today(owner, callback) {

		this.exit_callback = callback; // WTF? Could not this just pass callee's callback?
		this._owner = owner; // WTF?

		var xpath = this.ownerPath(owner) + "/" + this.todayPathElement() + ".json";
		console.log("[STATS] TODAY xpath: " + xpath);
		this.path = xpath; // WTF? Side effect?

		if (!fs.existsSync(xpath)) {
			console.log("[STATS] TODAY Statistics not found...");
			if (this.once === false) {
				console.log("[STATS] [TODAY-N-ONCE] Calling Aggregate for today data (forwarding callback)..."); // FIXME
				this.once = true;
				this.aggregate(callback); // uses exit_callback?
			} else {
				console.log("[STATS] [TODAY-N-ONCE] Stats not found..."); // FIXME
				this.exit_callback(false, "stats_not_found in " + xpath);
			}
		} else {
			this.once = false;
			console.log("[STATS] Fetching recent statistics..."); // FIXME
			var today = true;
			this.parse(owner, today, () => { this.parse_callback(xpath); });
		}
	}

	/**
	* Returns weekly data created by ETL if available
	* @param {string} owner - restrict to owner
	* @param {function} callback (err, statistics) - async return callback, returns statistics or error
	*/

	week(owner, callback) {

		var atLeastOneFileFound = false;
		var results = {};

		for (var d = 6; d >= 0; d--) {

			var wpath = this.ownerPath(owner) + "/" + this.weekPathElement(d) + ".json";

			if (!fs.existsSync(wpath)) {
				continue;
			}

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
		callback(atLeastOneFileFound, results);
	}

	todayPathElement() {
		return dateFormat(new Date(), "isoDate");
	}

	weekPathElement(daysBack) {
		const newDate = new Date(Date.now() - (86400000 * daysBack));
		return dateFormat(newDate, "isoDate");
	}

	forceLogPath(logpath) {
		this.LOG_PATH = logpath;
	}
};
