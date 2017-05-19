/** This THiNX-RTM API module is responsible for managing API Keys.
    This is the new version that will use Redis only. */

var APIKey = (function() {

	//var app_config = require("../../conf/config.json");
	//var db = app_config.database_uri;
	//var nano = require("nano")(db);

	var redis = require("redis");
	var session = require("express-session");
	var redisStore = require('connect-redis')(session);
	var client = redis.createClient();
	var sha256 = require("sha256");

	var _private = {

		/**
		 * No magic. Anyone can invent API Key, but it must be assigned to valid owner.
		 * @return {string} full-blown API Key (no hashing so far)
		 */

		new: function() {
			var string_from_date = new Date().toString();
			return sha256(string_from_date);
		}

	};

	// public
	var _public = {

		/**
		 * Create new API Key for owner
		 * @param {string} owner - owner._id
		 * @param {string} apikey_alias - requested API key alias
		 * @param {function} callback (err, apikey) - async return callback, returns new api key...
		 * @return {string} api_key - full blown API Key once, no hashes...
		 */

		create: function(owner, apikey_alias, callback) {

			var new_api_key = _private.new();

			var api_key_object = {
				"key": new_api_key,
				"hash": sha256(new_api_key),
				"alias": apikey_alias
			};

			// Fetch owner keys from redis
			client.get("ak:" + owner, function(err, json_keys) {

				// Create new owner object if not found
				if (err) {
					client.set("ak:" + owner, JSON.stringify([api_key_object]));
					return;
				}

				// Update existing key with new data
				var api_keys = JSON.parse(json_keys);
				api_keys.push(api_key_object);
				client.set("ak:" + owner, JSON.stringify(api_keys));
				callback(true, api_key_object);

			});

		},

		/**
		 * Verify API Key (should return at least owner_id if valid)
		 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
		 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
		 */

		verify: function(owner, apikey, callback) {

			// Fetch owner keys from redis
			client.get("ak:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					console.log("[APIKey:verify:error]:" + err);
					callback(false);
					return;
				}

				// Check API Key against stored objects
				if ((typeof(json_keys) !== "undefined") || (json_keys !== null)) {
					var keys = JSON.parse(json_keys);
					console.log("[apikey: verify]: fetched keys" + json_keys);
					for (var ki in keys) {
						if (keys[ki].key.indexOf(apikey) != 1) {
							callback(true);
							return; // valid key found, early exit
						}
					}
					callback(false, "owner_found_but_no_key"); // no key found
				} else {
					callback(false, "owner_not_found");
				}
			});

		},

		/**
		 * Revoke API Key
		 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
		 * @param {string} api_key - has from the UI... will not search by api_key!
		 * @param {function} callback - async return callback, returns true or false and error
		 */

		revoke: function(owner, apikey_hash, callback) {

			// Fetch owner keys from redis
			client.get("ak:" + owner, function(err, json_keys) {

				// Return false if not found
				if (err) {
					console.log("[APIKey:revoke:error]:" + err);
					callback(false);
					return;
				}

				// Check API Key against stored objects
				if ((typeof(json_keys) !== "undefined") || (json_keys !== null)) {
					var keys = JSON.parse(json_keys);
					for (var ki in keys) {
						var key_hash = "" + keys[ki].hash;
						if (key_hash.indexOf(apikey_hash) != 1) {
							delete keys[apikey_hash];
							client.set("ak:" + owner, JSON.stringify(keys));
							callback(true);
							return;
						}
					}
					callback(false, "owner_found_but_no_key"); // no key found
				} else {
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
					console.log("[APIKey:revoke:error]:" + err);
					callback(false, "owner_not_found");
					return;
				}

				// Check API Key against stored objects
				if ((typeof(json_keys) !== "undefined") || (json_keys !== null)) {
					var api_keys = JSON.parse(json_keys);
					var exportedKeys = [];
					for (var index in api_keys) {
						var info = {
							name: "******************************" + api_keys[index].key.substring(
								30),
							hash: api_keys[index].hash,
							alias: api_keys[index].alias
						};
						exportedKeys.push(info);
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

exports.create = APIKey.create;
exports.verify = APIKey.verify;
exports.revoke = APIKey.revoke;
exports.list = APIKey.list;
