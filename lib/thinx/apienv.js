/** This THiNX Device Management API module is responsible for managing Environment variables securely. */

module.exports = class APIEnv {

	constructor(redis) {
		if (typeof (redis) === "undefined") throw new Error("APIEnv now requires connected redis.");
		this.redis = redis;
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

		this.redis.get("env:" + owner, (error, existing) => {

			var env_vars = JSON.parse(existing);
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

			this.redis.set("env:" + owner, JSON.stringify(new_vars));

			callback(true, key);

		});

	}

	/**
	 * Fetch Environment variable (internal method only)
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {string} name - API key name
	 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
	 */

	fetch(owner, name, callback) {
		this.redis.get("env:" + owner, (error, json_keys) => {
			if (!json_keys) {
				return callback(false, "key_not_found");
			}
			const keys = JSON.parse(json_keys);
			for (var key in keys) {
				if (Object.keys(keys[key])[0] == name) {
					return callback(true, keys[key]);
				}
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
		this.redis.get("env:" + owner, (error, json_keys) => {

			// Check Environment variables against stored objects
			if ((json_keys == []) || (typeof (json_keys) === "undefined") || (json_keys === null)) {
				console.log("[ENVVar:revoke:error]:", error);
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
						if (typeof (deleted_vars[name]) === "undefined") {
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

			this.redis.set("env:" + owner, JSON.stringify(new_vars));
			callback(true, deleted_vars);
		});
	}

	/**
	 * List Environment variables for owner
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, body) - async return callback
	 */

	list(owner, callback) {
		this.redis.get("env:" + owner, (error, json_keys) => {
			if ((typeof (json_keys) !== "undefined") && (json_keys !== null)) {
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
