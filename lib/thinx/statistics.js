/*
 * This THiNX-RTM API module is responsible for aggregating daily statistics.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var mkdirp = require("mkdirp");
var dateFormat = require("dateformat");
var fs = require("fs-extra");
// var parse = require("parse-date"); unused, remove...
var readline = require("readline");

module.exports = class Statistics {

	static get_owner_template() {
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

	constructor() {

		this.ROOT = app_config.project_root;

		// TODO: FIXME: REFACTOR: this is wrong... all events MUST be explicitly routed (e.g. using an event/message queue) through a specific logging class
		this.LOG_PATH = "/opt/thinx/.pm2/logs/index-out-1.log";
		this.TEMP_PATH = this.ROOT + "/statistics/stats.temp";
		this.STATS_PATH = this.ROOT + "/statistics/";

		this.once = false;
		this.path = "";
		this.exit_callback = null;
		this.parser = null;
		this._owner = "4f1122fa074af4dabab76a5205474882c82de33f50ecd962d25d3628cd0603be";

		// Create statistics folder if not found on init
		if (!fs.existsSync(this.STATS_PATH)) {
			console.log("Creating " + this.STATS_PATH + " from " + __dirname);
			mkdirp(this.STATS_PATH, (err) => {
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

		this.owners = { "4f1122fa074af4dabab76a5205474882c82de33f50ecd962d25d3628cd0603be" : Statistics.get_owner_template() }; // test owner only

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
		for (var owner_id in this.owners) {
			var owner_data = this.owners[owner_id];
			var dirpath = this.STATS_PATH + owner_id;
			var path = dirpath + "/" + this.todayPathElement() + ".json";
			console.log("[closeParsers] parser closed: Writing stats to dirpath '"+dirpath+"'");
			var mkresult = mkdirp(dirpath);
			if (mkresult) {
				console.log("[closeParsers] error creating statistic path for owner: " + mkresult);
			} else {
				try {
					this.write_stats(false, path, dirpath, owner_data);
				} catch (e) {
					console.log("[closeParsers] Error saving stats: "+e);
				}
			}
			if (typeof(this.exit_callback) === "function") {
				console.log("[closeParsers] calling exit_callback");
				this.exit_callback(true, this.owners[owner_id]);
			} else {
				console.log("[closeParsers] NO exit_callback!");
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

		var oid = this._owner;

		console.log("[parse_oid_date_and_line] Parsing OID for owner "+oid);

		if (scanline.length > 2) {
			var otemp = scanline[2];
			if (otemp.indexOf("[OID:") !== -1) {
				oid = otemp.substr(3).replace("[OID:", "");
				if (oid != this._owner) {
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
				//if (today) {
					console.log("[parse_oid_date_and_line] skipping off-date record at " + date);
					return;
				//}
			}
			//console.log("linedate: " + linedate.toDateString());
		}
		console.log("[parse_oid_date_and_line] parsing line for owner " + oid);
		this.parse_line(this.owners[oid], line);
	}

	// This is called after parse completes. Should return
	// existing pre-parsed file from path or nothing if parser failed.
	parse_callback(path) {
		//console.log("Parse callback starting...");
		if (typeof(this.exit_callback) !== "function") {
			// exit_callback not set for parse_callback [coule be when called from aggregator]
			console.log("Parse callback: no exit callback!...");
		}
		if (fs.existsSync(path)) {
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
			this.owners[oid] = Statistics.get_owner_template(); // init stat object per owner
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
			console.log("[write_stats] Write-stats error: " + err);
			return;
		}
		console.log("[write_stats] Writing stats to owner directory '"+dirpath+"' path " + path);
		let result = mkdirp.sync(dirpath);
		if (result) {
			console.log("[write_stats] Write-stats mkdirp error: " + result);
			// may already exist, exit?
		}
		if (fs.existsSync(path)) {
			// ignore unlink error
			fs.unlinkSync(path);
		}
		this.write(path, owner_data);
	}

	/**
	* Performs ETL transaction from current log
	*/

	parse(owner, completed_callback) {

		this.exit_callback = completed_callback;

		if (!fs.existsSync(this.LOG_PATH)) {
			console.log("[PARSE] THiNX log not found at:" + this.LOG_PATH);
			if (typeof(completed_callback) !== "undefined") completed_callback(false, "log_not_found in " + this.LOG_PATH);
			return;
		}

		fs.copy(this.LOG_PATH, this.TEMP_PATH, (err) => {

			if (err) {
				console.log("copy error" + err);
				if (typeof(completed_callback) !== "undefined") completed_callback(false, err);
				return;
			}

			this.parser = readline.createInterface({
				input: fs.createReadStream(this.TEMP_PATH),
				output: null,
				console: false,
				terminal: false
			});

			if (typeof(this.parser) === "undefined") {
				console.log("[ERROR][PARSER] could not be instantiated in PARSE!");
				if (typeof(completed_callback) !== "undefined") completed_callback(false, "no_parser");
				return;
			}

			this.parser.on("line", (line) => {
				this.parse_oid_date_and_line(line);
			});
			this.parser.on("close", (line) => {
				this.closeParsers();
			});

			this.owners[owner] = Statistics.get_owner_template();
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
				if (typeof(callback) !== "undefined") callback(false, "copy_error "+err); // no success
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
				if (typeof(callback) !== "undefined") callback(false, "parser_error"); // no success
				return false;
			}

			this.parser.on("line", (line) => {
				if (line.indexOf("[OID:") !== -1) {
					this.parse_oid(line);
				}
			});

			this.parser.on("close", (line) => {

				console.log("Closing with owners: ");
				console.log(this.owners);

				// This looks pretty like a bottleneck.
				for (var owner_id in this.owners) {
					if (typeof(owner_id) === "undefined") continue;
					if (owner_id === "undefined") continue;
					console.log("closing oid "+owner_id);
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
				if (typeof(callback) !== "undefined") {
					callback(true, "parser_error");
				}

				// Expects global callback being set already
				if (typeof(parse_callback) === "function") {
					console.log("returning into parse_callback...");
					this.parse_callback(this.path); // should call callback
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

		if (typeof(callback) !== "undefined") {
			console.log("[today] Saving exit callback in today()...");
			this.exit_callback = callback;
		}

		this._owner = owner; // WTF?

		var xpath = this.ownerPath(owner) + "/" + this.todayPathElement() + ".json";
		console.log("[today] xpath: " + xpath);
		this.path = xpath; // WTF? Side effect?

		if (!fs.existsSync(xpath)) {
			console.log("[today] Statistics not found...");
			if (this.once === false) {
				console.log("[today] Calling Aggregate for today data (forwarding callback)..."); // FIXME
				this.once = true;
				this.aggregate(callback); // uses exit_callback?
			} else {
				console.log("[today] Stats not found..."); // FIXME
				if (typeof(callback) === "function") {
					callback(false, "stats_not_found in " + xpath);
				} else {
					console.log("[today] No callback, exiting..."); // FIXME
					return;
				}
			}
		} else {
			if (this.once == true) {
				this.once = false;
				console.log("[today] Fetching recent statistics..."); // FIXME
				this.parse(owner, () => {
					//console.log("[today] Running parse_callback should have exit_callback predefined on use!..."); //
					this.parse_callback(xpath);
				});
			} else {
				if (typeof(callback) === "function") {
					callback(false, "stats_not_found in " + xpath);
				} else {
					console.log("[today] No stats available, exiting..."); // FIXME
					return;
				}
			}
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
