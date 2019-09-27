/** This THiNX-RTM API module is responsible for managing Environment variables securely. */

var Globals = require("./globals");
var rollbar = Globals.rollbar();

module.exports = class APIEnv {

	constructor() {
		var redis = require("redis");
		this.client = redis.createClient(Globals.redis_options());
	}

	/**
	 * Store new Environment variable for owner
	 * @param {string} owner - owner_id
	 * @param {string} key - requested variable name
	 * @param {string} value - requested value
	 * @param {function} callback (err, response) - async return callback, should confirm creation...
	 */

	create(owner, key, value, callback) {

		var env_var_object = {};
		env_var_object[key] = value;

		this.client.get("env:" + owner, (ferr, json_keys) => {

			// Create new owner object if nothing found
			if (ferr) {

				this.client.set("env:" + owner, JSON.stringify([env_var_object]),
					(serr) => {
						if (serr) {
							callback(false, serr);
						} else {
							callback(true, json_keys);
						}
					});
				return;
			}

			var env_vars = JSON.parse(json_keys);
			if (env_vars === null) {
				env_vars = [];
			}

			// skip existing key on copy, so we can replace it with new value
			var new_vars = [];
			for (var dindex in env_vars) {
				var obj = env_vars[dindex];
				if (Object.keys(obj)[0].indexOf(key) !== -1) {
					continue;
				}
				new_vars.push(env_vars[dindex]);
			}
			new_vars.push(env_var_object);

			this.client.set("env:" + owner, JSON.stringify(new_vars),
				(err) => {
					if (err) {
						callback(false, err);
					} else {
						callback(true, key);
					}
			}); // set
		}); // get

	}

	/**
	 * Fetch Environment variable (internal method only)
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {string} name - API key name
	 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
	 */

	fetch(owner, name, callback) {
		this.client.get("env:" + owner, (err, json_keys) => {
			// Return false if not found
			if (err) {
				callback(false, err);
			} else {
				const keys = JSON.parse(json_keys);
				for (var key in keys) {
					var key_name = Object.keys(keys[key])[0];
					if (key_name == name) {
						callback(true, keys[key]);
						return;
					}
				}
				callback(false, "key_not_found");
			}
		});
	}

	/**
	 * Revoke Environment variable
	 * @param {string} owner - owner_id
	 * @param {string} name - name of the variable
	 * @param {function} callback - async return callback, returns true or false and error
	 */

	revoke(owner, changes, callback) {

		// Fetch owner keys from redis
		this.client.get("env:" + owner, (err, json_keys) => {

			// Return false if not found
			if (err) {
				console.log("[ENVVar:revoke:error]:" + err);
				callback(false, "not_found");
				return;
			}

			// Check Environment variables against stored objects
			if ((typeof(json_keys) === "undefined") || (json_keys === null)) {
				callback(false, "owner_not_found");
				return;
			}

			// Parse all env vars and list of changes for each
			var new_vars = [];
			var deleted_vars = {};
			var deletes = 0;
			var vars = JSON.parse(json_keys);
			for (var ki in vars) {
				var env_name = "" + Object.keys(vars[ki])[0];
				var deleted = false;
				for (var nindex in changes) {
					var name = changes[nindex];
					if (env_name == name) {
						if (typeof(deleted_vars[name]) === "undefined") {
							deleted_vars[name] = "deleted";
							deletes++;
							deleted = true;
						}
					}
				}
				if (deleted === false) {
					new_vars.push(vars[ki]);
				}
			}

			if (deletes == 0 || deleted_vars.count == 0) {
				callback(false, "nothing_to_revoke");
				return;
			}

			this.client.set("env:" + owner, JSON.stringify(new_vars), (eerr, reply) => {
				if (eerr) {
					console.log(eerr);
					callback(false, eerr);
				} else {
					console.log(reply);
					callback(true, deleted_vars);
				}
			});
		});
	}

	/**
	 * List Environment variables for owner
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, body) - async return callback
	 */

	list(owner, callback) {

		this.client.get("env:" + owner, (err, json_keys) => {

			// Return false if not found
			if (err) {
				rollbar.warning("Env list owner not found: " + owner);
				callback(true, []);
				return;
			}

			if ((typeof(json_keys) !== "undefined") && (json_keys !== null)) {
				var env_keys = JSON.parse(json_keys);
				if (env_keys === null) {
					env_keys = [];
				}
				var exportedKeys = [];
				for (var index in env_keys) {
					exportedKeys.push(Object.keys(env_keys[index])[0]);
				}
				callback(true, exportedKeys);
			} else {
				callback(true, []);
			}
		});
	}

};
