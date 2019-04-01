/** This THiNX-RTM API module is responsible for managing API Keys.
    This is the new version that will use Redis only. */

var APIKey = (function() {

	var redis = require("redis");
	var client = redis.createClient();
	var sha256 = require("sha256");

	var Rollbar = require("rollbar");
	var app_config = require("../../conf/config.json");
	var rollbar = new Rollbar({
		accessToken: app_config.rollbar_token,
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	var alog = require("./audit");

	var prefix = "";
	try {
		var pfx_path = app_config.project_root + '/conf/.thx_prefix';
		if (fs.existsSync(pfx_path)) {
			prefix = fs.readFileSync(pfx_path) + "_";
		}
	} catch (e) {
		console.log("[apikey] thx_prefix_exception" + e);
	}

	var _private = {

		/**
		 * No magic. Anyone can invent API Key, but it must be assigned to valid owner.
		 * @return {string} full-blown API Key (no hashing so far)
		 */

		new: function(owner_id) {
			return sha256(prefix + owner_id + new Date().toString());
		}

	};

	// public
	var _public = {

		/**
		 * Create new API Key for owner
		 * @param {string} owner_id - owner_id
		 * @param {string} apikey_alias - requested API key alias
		 * @param {function} callback (err, apikey) - async return callback, returns new api key...
		 * @return {string} api_key - full blown API Key once, no hashes...
		 */

		create: function(owner_id, apikey_alias, callback) {

			var new_api_key = _private.new(owner_id);

			var api_key_object = {
				"key": new_api_key,
				"hash": sha256(new_api_key),
				"alias": apikey_alias
			};

			// Fetch owner keys from redis
			client.get("ak:" + owner_id, function(err, json_keys) {

				// Create new owner object if nothing found
				if (err) {
					client.set("ak:" + owner_id, JSON.stringify([api_key_object]), function(
						err) {
						if (err) {
							console.log("[apikey] first key NOT created.");
							if (typeof(callback) !== "undefined") {
								callback(false);
							}
						} else {
							console.log("[apikey] first key created.");
							if (typeof(callback) !== "undefined") {
								callback(true, api_key_object);
							}
						}
					});
					return;
				}

				// Update existing key with new data
				var api_keys = JSON.parse(json_keys);
				if (api_keys === null) {
					api_keys = [];
				}
				api_keys.push(api_key_object);
				client.set("ak:" + owner_id, JSON.stringify(api_keys), function(
					err) {
					if (typeof(callback) !== "undefined") {
						if (err) {
							callback(false, err);
						} else {
							callback(true, api_key_object);
						}
					}
				});

			});

		},

		/**
		 * Verify API Key (should return at least owner_id if valid)
		 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
		 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
		 */

		verify: function(owner, apikey, req, callback) {

			// Fetch owner keys from redis
			client.get("ak:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					if (typeof(callback) !== "undefined") {
						callback(false);
					}
					return;
				}

				// Check API Key against stored objects
				if ((typeof(json_keys) !== "undefined") && (json_keys !== null)) {
					var keys = JSON.parse(json_keys);
					for (var ki in keys) {
						if (keys[ki].key.indexOf(apikey) !== -1) {
							if (typeof(callback) !== "undefined") {
								callback(true);
							}
							return; // valid key found, early exit
						}
					}
					alog.log(owner, "Attempt to use invalid API Key: " + apikey, "error");
					//console.log("Valid API key not found for this owner in " + json_keys);
					if (typeof(callback) !== "undefined") {
						console.log("Invalid API key request from address " + req.ip + " with key " + apikey);
						callback(false, "owner_found_but_no_key"); // no key found
					}
				} else {
					console.log("API key " + apikey + " verification failed for owner: " + owner);
					if (typeof(callback) !== "undefined") {
						callback(false, "apikey_not_found: " + "ak:" + owner);
					}
				}
			});

		},

		/**
		 * Revoke API Key
		 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
		 * @param {string} api_key - has from the UI... will not search by api_key!
		 * @param {function} callback - async return callback, returns true or false and error
		 */

		revoke: function(owner, apikey_hashes, callback) {

			// Fetch owner keys from redis
			client.get("ak:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					console.log("[APIKey:revoke:error]:" + err);
					callback(false);
					return;
				}

				var new_keys = [];
				var deleted_keys = [];

				// Check API Key against stored objects
				if ((typeof(json_keys) !== "undefined") && (json_keys !== null)) {
					var keys = JSON.parse(json_keys);

					for (var ki in keys) {
						var key_hash = sha256("" + keys[ki]);

						// Evaluate existing key_hash in deletes and remove...
						// First successful result should be sufficient.
						var deleted = false;
						for (var apikey_hash_index in apikey_hashes) {
							// Skip revoked key(s)
							if (key_hash == apikey_hashes[apikey_hash_index]) {
								deleted = true;
								deleted_keys.push(key_hash);
								break;
							}
						}
						// In case none of the deletes is valid, keep this key.
						if (deleted === false) {
							new_keys.push(keys[ki]);
						}
					}

					client.set("ak:" + owner, JSON.stringify(new_keys), function(err,
						reply) {
						if (err) {
							callback(false);
							console.log(reply);
						} else {
							callback(true, deleted_keys);
						}
					});

				} else {
					// when json_keys is invalid
					callback(false, "owner_not_found");
				}
			});
		},

		/**
		 * List API Keys for owner
		 * @param {string} owner - 'owner' id
		 * @param {function} callback (err, body) - async return callback
		 */

		list: function(owner, callback) {
			// Fetch owner keys from redis
			client.get("ak:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					rollbar.warning("API Key list owner not found: " + owner);
					callback(true, []);
					return;
				}

				if ((typeof(json_keys) !== "undefined") && (json_keys !== null)) {
					var api_keys = JSON.parse(json_keys);
					if (api_keys === null) {
						api_keys = [];
					}
					var keys = Object.keys(api_keys);
					var exportedKeys = [];
					for (var index in keys) {
						var keyname = keys[index];
						var keydata = api_keys[keyname];

            console.log(keydata);

						var key = "**************************************";
						if (typeof(keydata.key) !== "undefined") {
							key = "******************************" + keydata.key
								.substring(
									30);
						}
						var info = {
							name: key,
							hash: sha256(keydata.key),
							alias: keydata.alias
						};
						exportedKeys.push(info);
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

exports.create = APIKey.create;
exports.verify = APIKey.verify;
exports.revoke = APIKey.revoke;
exports.list = APIKey.list;
