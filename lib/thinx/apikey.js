/** This THiNX-RTM API module is responsible for managing API Keys.
    This is the new version that will use Redis only. */

var Globals = require("./globals.js");
var prefix = Globals.prefix();
var rollbar = Globals.rollbar();

var sha256 = require("sha256");

module.exports = class APIKey {

  constructor() {
    this.client = require("redis").createClient(Globals.redis_options());
  }

	/**
	 * No magic. Anyone can invent API Key, but it must be assigned to valid owner.
	 * @return {string} full-blown API Key (no hashing so far)
	 */

	create_key(owner_id) {
		return sha256(prefix + owner_id + new Date().toString());
	}

  save_apikeys(owner_id, api_key_array, callback) {
    this.client.set("ak:" + owner_id, JSON.stringify(api_key_array), (nerr) => {
      if (nerr) {
        console.log("[apikey] first key NOT created.");
        if (typeof(callback) !== "undefined") {
          console.log("[apikey] calling back to router (false)...");
          callback(false);
        } else {
          console.log("apikey::save callback not defined!");
        }
      } else {
        console.log("[apikey] first key created.");
        if (typeof(callback) !== "undefined") {
          console.log("[apikey] calling back to router (array)...");
          callback(true, api_key_array);
        } else {
          console.log("apikey::save callback not defined!");
        }
      }
    });
  }

	/**
	 * Create new API Key for owner
	 * @param {string} owner_id - owner_id
	 * @param {string} apikey_alias - requested API key alias
	 * @param {function} callback (err, apikey) - async return callback, returns new api key...
	 * @return {string} api_key - full blown API Key once, no hashes...
	 */

	create(owner_id, apikey_alias, callback) {
		var new_api_key = this.create_key(owner_id);
		var api_key_object = {
			"key": new_api_key,
			"hash": sha256(new_api_key),
			"alias": apikey_alias
		};
		// Fetch owner keys from redis
		this.client.get("ak:" + owner_id, (cerr, json_keys) => {
			// Create new owner object if nothing found and return
			if (cerr || json_keys === null) {
        console.log("Saving first api key...");
				this.save_apikeys(owner_id, [api_key_object], callback);
			} else {
        // Update existing key with new data
  			var api_keys = JSON.parse(json_keys);
  			if (api_keys === null) {
  				api_keys = [];
  			}
  			api_keys.push(api_key_object);
        console.log("Saving updated api keys...");
        this.save_apikeys(owner_id, api_keys, callback);
      }
		});
	}

  log_invalid_key(apikey, req, callback) {
    var AuditLog = require("./audit");
    var alog = new AuditLog();
    alog.log("OID?", "Attempt to use invalid API Key: " + apikey, "error");
    console.log("Valid API key not found for this owner:", apikey);
    if (typeof(callback) !== "undefined") {
      if (typeof(req) === "undefined" || req === null) {
        // MQTT request
        callback(true); // can be safely ignored, because we use MQTT authentication mechanism here (if properly configured)
        return;
      } else {
        // HTTP request
        console.log("Invalid API key request from address " + req.ip + " with key " + apikey);
        callback(false, "owner_found_but_no_key"); // no key found
      }
    }
  }

  key_in_keys(apikey, json_keys) {
    var keys = JSON.parse(json_keys);
    for (var ki in keys) {
      let value = keys[ki].key;
      if (value.indexOf(apikey) !== -1) {
        return true; // valid key found, early exit
      }
    }
    return false;
  }

	/**
	 * Verify API Key (should return at least owner_id if valid)
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
	 */

	verify(owner, apikey, req, callback) {
		// Fetch owner keys from redis
		this.client.get("ak:" + owner, (err, json_keys) => {
			// Return false if not found
			if (err) {
				if (typeof(callback) !== "undefined") {
					callback(false);
				} else {
          console.log("Callback undefined!!! in verify: (1)");
        }
				return;
			}
			// Check API Key against stored objects
			if ((typeof(json_keys) !== "undefined") && (json_keys !== null)) {
        if (this.key_in_keys(apikey, json_keys)) {
          console.log("API Key valid...");
          callback(true);
          return;
        } else {
          console.log("API Key invalid...");
          this.log_invalid_key(apikey, req, callback);
        }
			}
			console.log("API key " + apikey + " verification failed for owner: " + owner);
			if (typeof(callback) !== "undefined") {
				callback(false, "apikey_not_found: " + "ak:" + owner);
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

    let key_id = "ak:" + owner;

		// Fetch owner keys from redis
		this.client.get(key_id, (rerr, json_keys) => {

			// Return false if not found
			if (rerr) {
				console.log("[APIKey:revoke:error]:" + rerr);
				callback(false);
				return;
			}

			// Check API Key against stored objects
			if ((typeof(json_keys) === "undefined") || (json_keys === null)) {
        // when json_keys is invalid
        console.log("[APIKey:revoke:error]:owner_not_found");
				callback(false, "owner_not_found");
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
            console.log("Found key to be revoked.");
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
					callback(false);
				} else {
					callback(true, deleted_keys);
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
				callback(false, []);
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
					var key = "**************************************";
					if (typeof(keydata.key) !== "undefined") {
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
			var last_key_hash = null;
			var api_key = json_keys[key];
			for (var key in json_keys) {
				var kdata = json_keys[key];
				// console.log("kdata: " + JSON.stringify(kdata));
				if ((typeof(kdata) !== "undefined") && (kdata !== null)) {
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
				if ((typeof(kdata) !== "undefined") && (kdata !== null)) {
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
