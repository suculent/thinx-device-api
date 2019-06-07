/** This THiNX-RTM API module is responsible for managing Environment variables securely. */

var APIEnv = (function() {

	var Rollbar = require("rollbar");

	var app_config = require("../../conf/config.json");
	var rollbar = new Rollbar({
		accessToken: app_config.rollbar_token,
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	const r_options = {
  password: app_config.redis.password,
  retry_strategy: function (options) {
    console.log('retry strategy check');
    console.log(options);
    if (options.error) {
      if (options.error.code === 'ECONNREFUSED') {
        // End reconnecting on a specific error and flush all commands with a individual error
        return new Error('The server refused the connection');
      }
      if (options.error.code === 'ECONNRESET') {
        return new Error('The server reset the connection');
      }
      if (options.error.code === 'ETIMEDOUT') {
        return new Error('The server timeouted the connection');
      }
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      // End reconnecting after a specific timeout and flush all commands with a individual error
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 5) {
      // End reconnecting with built in error
      return new Error('Retry attempts ended');
    }
    // reconnect after
    return 1000;
  }
};

	var redis = require("redis");
	var client = redis.createClient("6379", app_config.redis.host, r_options);


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

			// Fetch owner keys from redis, shall be used only privately by API!
			client.get("env:" + owner, function(err, json_keys) {

				// Create new owner object if nothing found
				if (err) {
					client.set("env:" + owner, JSON.stringify([env_var_object]),
						function(
							err) {
							if (err) {
								callback(false, err);
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

				client.set("env:" + owner, JSON.stringify(new_vars),
					function(err) {
						if (err) {
							callback(false, err);
						} else {
							callback(true, key);
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

		fetch: function(owner, name, callback) {

			// Fetch owner keys from redis
			client.get("env:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					callback(false, err);
				} else {
					callback(true, json_keys[name]);
				}
			});

		},

		/**
		 * Revoke Environment variable
		 * @param {string} owner - owner_id
		 * @param {string} name - name of the variable
		 * @param {function} callback - async return callback, returns true or false and error
		 */

		revoke: function(owner, changes, callback) {

			// Fetch owner keys from redis
			client.get("env:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					console.log("[ENVVar:revoke:error]:" + err);
					callback(false);
					return;
				}

				// Check Environment variables against stored objects
				if ((typeof(json_keys) === "undefined") || (json_keys === null)) {
					callback(false, "owner_not_found");
					return;
				}

				// Parse all env vars and list of changes for each
				var new_vars = [];
				var deleted_vars = [];
				var deletes = 0;
				var vars = JSON.parse(json_keys);
				for (var ki in vars) {
					var env_name = "" + Object.keys(vars[ki])[0];
					var deleted = false;
					for (var nindex in changes) {
						var name = changes[nindex];
						if (env_name == name) {
							deleted = true;
							deletes++;
							if (typeof(deleted_vars.name) === "undefined") {
								deleted_vars.push(name);
							}
						}
					}
					if (deleted === false) {
						new_vars.push(vars[ki]);
					}
				}

				if (deletes === 0) {
					callback(false, "nothing_to_revoke");
					return;
				}

				client.set("env:" + owner, JSON.stringify(new_vars), function(err,
					reply) {
					if (err) {
						console.log(err);
						callback(false, err);
					} else {
						console.log(reply);
						callback(true, deleted_vars);
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
					console.log("owner_not_found");
					callback(true, []);
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
					callback(true, []);
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
