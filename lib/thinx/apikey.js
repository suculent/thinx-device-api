/** This THiNX-RTM API module is responsible for managing API Keys.
	This is the new version that will use Redis only. */

var Globals = require("./globals.js");
var rollbar = Globals.rollbar();
var AuditLog = require("./audit");
var sha256 = require("sha256");

module.exports = class APIKey {

	constructor() {
		let options = Globals.redis_options();
		this.client = require("redis").createClient(options);
		this.alog = new AuditLog();
		this.prefix = Globals.prefix();
	}

	/**
	 * No magic. Anyone can invent API Key, but it must be assigned to valid owner.
	 * @return {string} full-blown API Key (no hashing so far)
	 */

	create_key(owner_id) {
		return sha256(this.prefix + owner_id + new Date().toString());
	}

	save_apikeys(owner_id, api_key_array, callback) {
		//console.log("Saving API Keys", api_key_array, "for owner", owner_id);
		if ((typeof (callback) === "undefined") || (callback === null)) {
			console.log("Saving API Keys without callback Request may fail!");
		}
		this.client.set("ak:" + owner_id, JSON.stringify(api_key_array), (nerr) => {
			if (nerr) {
				console.log("[apikey] first key NOT created.");
				if ((typeof (callback) !== "undefined") && (callback !== null)) {
					console.log("[apikey] calling back to router (false)...");
					callback(false);
				} else {
					console.log("apikey::save callback not defined. OK.");
				}
			} else {
				this.client.save();
				if ((typeof (callback) !== "undefined") && (callback !== null)) {
					callback(true, api_key_array); // warning, leaks all API Keys!?
				} else {
					console.log("apikey::save callback not defined. OK.");
				}
			}
		});
	}

	/**
	 * Create new API Key for owner
	 * @param {string} owner_id - owner_id
	 * @param {string} apikey_alias - requested API key alias
	 * @param {function} callback (err, apikey) - async return callback, returns new API Key...
	 * @return {string} api_key - full blown API Key once, no hashes...
	 */

	create(owner_id, apikey_alias, callback) {
		var new_api_key = this.create_key(owner_id);
		if (typeof(new_api_key) === "undefined") throw new Error("API Key generator error. Check test_ prefix for new_api_key.");
		if (typeof(owner_id) === "undefined") throw new Error("API Key generator error. Check owner_id");
		var api_key_object = {
			"key": new_api_key,
			"hash": sha256(new_api_key),
			"alias": apikey_alias
		};
		// Fetch owner keys from redis
		this.client.get("ak:" + owner_id, (cerr, json_keys) => {
			// Create new owner object if nothing found and return
			if (cerr || json_keys === null) {
				this.save_apikeys(owner_id, [api_key_object], callback);
			} else {
				// Update existing key with new data
				var api_keys = JSON.parse(json_keys);
				if (api_keys === null) {
					api_keys = [];
				}
				api_keys.push(api_key_object); // TODO: only if there is no Default MQTT API Key already present
				console.log("Saving updated API Keys...");
				this.save_apikeys(owner_id, api_keys, callback);
			}
		});
	}

	log_invalid_key(apikey, req, owner, callback) {
		this.alog.log(owner, "Attempt to use invalid API Key: " + apikey, "error");
		//console.log("[log_invalid_key] API key '" + apikey + "' not found for owner", owner);
		if (typeof (callback) !== "undefined") {
			if (typeof (req) === "undefined" || req === null) {
				// MQTT request
				callback(true); // can be safely ignored, because we use MQTT authentication mechanism here (if properly configured)
				return;
			} else {
				// HTTP request
				//console.log("Invalid API key request from address " + req.ip + " with key " + apikey);
				callback(false, "owner_found_but_no_key"); // no key found
			}
		}
	}

	key_in_keys(apikey, json_keys) {
		var keys = JSON.parse(json_keys);
		for (var ki in keys) {
			let value = keys[ki].key;
			if (value.indexOf(apikey) !== -1) {
				console.log("API Key found by Key.");
				return true; // valid key found, early exit
			}
		}
		for (var ha in keys) {
			let value = keys[ha].hash;
			if (value.indexOf(apikey) !== -1) {
				console.log(apikey, "API Key found by Hash.");
				return true; // valid hash found, early exit
			}
		}
		console.log("Failed searching", apikey);
		return false;
	}

	/**
	 * Verify API Key (should return only boolean if valid)
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {apikey} apikey - apikey
	 * @param {req} req - used for callback... not sent for mqtt; should be is_mqtt; TODO: FIXME: REFACTOR 
	 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
	 */

	verify(owner, apikey, req, callback)
	{
		if (typeof (callback) === "undefined") {
			console.log("warning: verify callback undefined(1)");
		}

		// Test stack only, does not verify this api_key from envi.json
		if (process.env.ENVIRONMENT === "test") {
			if (apikey.indexOf("a6d548c60da8307394d19894a246c9e9eec6c841b8ad54968e047ce0a1687b94") !== -1) {
				callback(true, null);
				return;
			}
		}

		// Fetch owner keys from redis
		this.client.get("ak:" + owner, (err, json_keys) => {

			if (typeof (callback) === "undefined") {
				console.log("warning: verify callback undefined(2)");
			}

			// Return false if not found
			if (err !== null) {
				if (typeof (callback) !== "undefined") {
					callback(false, err);
				} else {
					console.log("Callback undefined!!! in verify: (1)", err);
				}
				return;
			}

			// Check API Key against stored objects
			if ((typeof (json_keys) !== "undefined") && (json_keys !== null)) {
				if (this.key_in_keys(apikey, json_keys)) {
					if (typeof (callback) !== "undefined") {
						callback(true);
						return;
					} else {
						console.log("callback undefined in verify (2)");
					}
				} else {
					console.log("[verify] API Key", apikey, "not found!");
					this.log_invalid_key(apikey, req, owner, callback);
					return;
				}
			}
			
			console.log("API key '" + apikey + "' verification failed for owner: " + owner);
			if (typeof (callback) !== "undefined") {
				callback(false, "apikey_not_found for owner "+owner);
			}
		});
	}

	/**
	 * Revoke API Key
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {string} api_key - has from the UI... will not search by api_key!
	 * @param {function} callback - async return callback, returns true or false and error
	 */

	revoke(owner, apikey_hashes, callback) {

		if (typeof (callback) == "undefined") {
			console.log("Warning, callback unset in revoke()");
		}

		let key_id = "ak:" + owner;

		// Fetch owner keys from redis
		this.client.get(key_id, (rerr, json_keys) => {

			// Return false if not found
			if (rerr) {
				console.log("[APIKey:revoke:error]:" + rerr);
				if (typeof (callback) !== "undefined") {
					callback(false, null);
				}
				return;
			}

			// Check API Key against stored objects
			if ((typeof (json_keys) === "undefined") || (json_keys === null)) {
				// when json_keys is invalid
				console.log("[APIKey:revoke:error]:owner_not_found");
				if (typeof (callback) !== "undefined") {
					callback(false, "owner_not_found");
				}
				return;
			}

			var new_keys = [];
			var deleted_keys = [];
			var keys = JSON.parse(json_keys);

			for (var ki in keys) {
				var key_hash = keys[ki].hash;
				// Evaluate existing key_hash in deletes and remove...
				// First successful result should be sufficient.
				var deleted = false;

				for (var apikey_hash_index in apikey_hashes) {
					// Skip revoked key(s)
					if (key_hash === apikey_hashes[apikey_hash_index]) {
						deleted = true;
						deleted_keys.push(key_hash);
					}
				}
				// In case none of the deletes is valid, keep this key.
				if (deleted === false) {
					new_keys.push(keys[ki]);
				}
			}

			this.client.set(key_id, JSON.stringify(new_keys), (err, reply) => {
				if (err) {
					console.log(err, reply);
					if (typeof (callback) !== "undefined") {
						callback(false, null);
					}
				} else {
					this.client.save();
					if (typeof (callback) !== "undefined") {
						callback(true, deleted_keys);
					}
				}
			});

		});
	}

	/**
	 * List API Keys for owner
	 * @param {string} owner - 'owner' id
	 * @param {function} callback (err, body) - async return callback
	 */

	list(owner, callback) {
		// Fetch owner keys from redis
		this.client.get("ak:" + owner, (err, json_keys) => {
			// Return false if not found
			if (err) {
				rollbar.warning("API Key list owner not found: " + owner);
				console.log("AKList: error callback");
				callback(false, []);
				return;
			}
			if ((typeof (json_keys) !== "undefined") && (json_keys !== null)) {
				var api_keys = JSON.parse(json_keys);
				if (api_keys === null) {
					api_keys = [];
				}
				var keys = Object.keys(api_keys);
				var exportedKeys = [];
				for (var index in keys) {
					var keyname = keys[index];
					var keydata = api_keys[keyname];
					var key = "**************************************";
					if (typeof (keydata.key) !== "undefined") {
						key = keydata.key; // should be masked but the builder fails to fetch keys for building
						//key = "******************************" + keydata.key.substring(30);
					}
					var info = {
						name: "******************************" + key.substring(30),
						key: key, // warning; cleartext key!!!
						hash: sha256(keydata.key),
						alias: keydata.alias
					};
					exportedKeys.push(info);
				}
				callback(true, exportedKeys);
			} else {
				callback(false, []);
			}
		});
	}

	// used by mqtt

	get_first_apikey(owner, callback) {
		this.list(owner, (success, json_keys) => {
			if (!success) {
				console.log("API Key list failed. " + json_keys);
				callback(false, "messenger_has_no_api_keys");
				return;
			}
			var api_key = null;
			for (var key in json_keys) {
				var kdata = json_keys[key];
				if ((typeof (kdata) !== "undefined") && (kdata !== null)) {
					api_key = kdata.name;
					break;
				}
			}
			if (api_key === null) {
				console.log("Messenger requires Default MQTT API Key.");
				callback(false, "messsenger_requires_mqtt_api_key");
				return;
			}
			callback(true, api_key);
		});
	}

	// used by builder
	get_last_apikey(owner, udid, callback) {

		this.list(owner, (success, json_keys) => {
			if (!success) {
				console.log("API Key list failed. " + json_keys);
				callback(false, "owner_has_no_api_keys");
				return;
			}
			var last_key_hash = owner.last_key_hash;
			var api_key = null;
			for (var key in json_keys) {
				var kdata = json_keys[key];
				// console.log("kdata: " + JSON.stringify(kdata));
				if ((typeof (kdata) !== "undefined") && (kdata !== null)) {
					if (sha256(kdata.hash) == last_key_hash) {
						api_key = kdata.name;
						break;
					} else {
						api_key = kdata.name; // pick valid key automatically if not the selected one
					}
				}
			}
			if (api_key === null) {
				console.log("Build requires API Key result.");
				callback(false, "build_requires_api_key");
				return;
			}
			callback(true, api_key);
		});
	}

};
