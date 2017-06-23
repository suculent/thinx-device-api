/** This THiNX-RTM API module is responsible for managing Environment variables securely. */

var APIEnv = (function() {

	var redis = require("redis");
	var client = redis.createClient();
	var sha256 = require("sha256");

	var Rollbar = require('rollbar');

	var rollbar = new Rollbar({
		accessToken: '5505bac5dc6c4542ba3bd947a150cb55',
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	var _public = {

		/**
		 * Store new Environment variable for owner
		 * @param {string} owner - owner_id
		 * @param {string} key - requested variable name
		 * @param {string} value - requested value
		 * @param {function} callback (err, response) - async return callback, should confirm creation...
		 */

		create: function(owner, key, value, callback) {

			var env_var_object = {};
			env_var_object[key] = value;

			// Fetch owner keys from redis
			client.get("env:" + owner, function(err, json_keys) {

				// Create new owner object if nothing found
				if (err) {
					client.set("env:" + owner, JSON.stringify([env_var_object]),
						function(
							err) {
							if (err) {
								console.log("[envvar] first key NOT created.");
								callback(false);
							} else {
								console.log("[envvar] first key created.");
								callback(true, env_var_object);
							}
						});
					return;
				}

				// Update existing key with new data
				var env_vars = JSON.parse(json_keys);
				if (env_vars === null) {
					env_vars = [];
				}
				env_vars[env_var_object.key] = env_var_object.value;
				client.set("env:" + owner, JSON.stringify(env_vars), function(
					err) {
					if (err) {
						callback(false, err);
					} else {
						callback(true, env_var_object);
					}
				});

			});

		},

		/**
		 * Fetch Environment variable (internal method only)
		 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
		 * @param {string} name - API key name
		 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
		 */

		fetch: function(name, callback) {

			// Fetch owner keys from redis
			client.get("env:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					callback(false, err);
				} else {
					callback(true, json_keys);
				}
			});

		},

		/**
		 * Revoke Environment variable
		 * @param {string} owner - owner_id
		 * @param {string} name - name of the variable
		 * @param {function} callback - async return callback, returns true or false and error
		 */

		revoke: function(owner, names, callback) {

			// Fetch owner keys from redis
			client.get("env:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					console.log("[ENVVar:revoke:error]:" + err);
					callback(false);
					return;
				}

				// Check Environment variables against stored objects
				if ((typeof(json_keys) !== "undefined") && (json_keys !== null)) {
					callback(false, "owner_not_found");
					return;
				}

				var new_vars = [];

				for (var nindex in names) {

					var name = names[nindex];
					var vars = JSON.parse(json_keys);

					for (var ki in vars) {
						var env_name = "" + vars[ki].name;

						var deleted = false;
						for (var idx in vars) {
							if (env_name == name) {
								deleted = true;
							}
						}

						if (deleted === false) {
							new_vars.push(vars[ki]);
						}
					}
				}

				client.set("env:" + owner, JSON.stringify(new_vars), function(err,
					reply) {
					if (err) {
						callback(false);
						console.log(reply);
					} else {
						callback(true, names);
					}
				});
			});
		},

		/**
		 * List Environment variables for owner
		 * @param {string} owner - 'owner' id
		 * @param {function} callback (err, body) - async return callback
		 */

		list: function(owner, callback) {
			// Fetch owner keys from redis
			client.get("env:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					rollbar.warning("Env list owner not found: " + owner);
					callback(false, "owner_not_found");
					return;
				}

				if ((typeof(json_keys) !== "undefined") && (json_keys !== null)) {
					var env_keys = JSON.parse(json_keys);
					console.log(json_keys);
					if (env_keys === null) {
						env_keys = [];
					}
					var exportedKeys = [];
					for (var index in env_keys) {
						exportedKeys.push(Object.keys(env_keys[index])[0]);
					}
					callback(true, exportedKeys);
				} else {
					callback(false, "owner_found_but_no_key"); // no key found
				}
			});
		}
	};

	return _public;

})();

exports.create = APIEnv.create;
exports.verify = APIEnv.fetch;
exports.revoke = APIEnv.revoke;
exports.list = APIEnv.list;
