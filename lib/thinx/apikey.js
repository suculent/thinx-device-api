/** This THiNX Device Management API module is responsible for managing API Keys.
	This is the new version that will use Redis only. */

var Globals = require("./globals.js");
var AuditLog = require("./audit");
var sha256 = require("sha256");
const crypto = require('crypto');

const InfluxConnector = require('./influx');

// Aliases that trigger the per-owner circuit breaker.
// Only the "Default MQTT API Key" auto-create path is gated (see incident
// 2026-05-31 thinx_api OOM) — user-driven create() calls remain unaffected
// so the operator can still issue manual API keys when Redis is healthy.
const DEFAULT_MQTT_APIKEY_ALIAS = "Default MQTT API Key";
const DEFAULT_KEY_BREAKER_WINDOW_MS = 60 * 1000;

// Detect node-redis ClientClosedError or equivalent connection-level failures.
// We deliberately bias toward MORE matches: a false positive (treating a
// transient bug as "unavailable") simply causes a retry; a false negative
// recreates the OOM-causing fall-through.
function isRedisUnavailable(err) {
	if (!err) return false;
	if (err.name === 'ClientClosedError') return true;
	if (err.name === 'SocketClosedUnexpectedlyError') return true;
	if (err.name === 'DisconnectsClientError') return true;
	if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;
	if (err.message && /closed|connection|disconnect|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(err.message)) return true;
	return false;
}

module.exports = class APIKey {

	constructor(redis) {
		this.redis = redis;
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
		this.redis.set("ak:" + owner_id, JSON.stringify(api_key_array), (error, result) => {
			if (error) {
				console.log("☣️ [error] [apikey] save_apikeys redis.set failed:", error && error.message ? error.message : error);
				return callback(false, error);
			}
			if (result !== "OK") {
				console.log("DEBUG save_apikeys result", result);
			}
			return callback(true, api_key_array);
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

		// Circuit breaker (scoped to the auto-create-default-MQTT-key path):
		// if Redis was reported unavailable for THIS owner within the breaker
		// window, refuse the retry WITHOUT touching this.redis. This is what
		// prevents the OOM-loop where create_mqtt_access fires repeatedly
		// against a dead Redis and Mosquitto accumulates orphan credentials.
		if (apikey_alias === DEFAULT_MQTT_APIKEY_ALIAS) {
			const last = APIKey._lastDefaultKeyAttempt.get(owner_id);
			if (typeof last === 'number' && (Date.now() - last) < DEFAULT_KEY_BREAKER_WINDOW_MS) {
				console.log(`☣️ [error] [apikey] circuit-breaker OPEN for owner ${owner_id} — skipping default MQTT key create (Redis recently unavailable)`);
				return callback(false, "redis_unavailable_backoff");
			}
		}

		var new_api_key = this.create_key(owner_id);

		if (typeof (new_api_key) === "undefined") console.log("☣️ [error] API Key generator error. Check test_ prefix for new_api_key.");
		if (typeof (owner_id) === "undefined") console.log("☣️ [error] API Key generator error. Check owner_id");

		var api_key_object = {
			"key": new_api_key,
			"hash": sha256(new_api_key),
			"alias": apikey_alias
		};

		// Fetch owner keys from redis
		this.redis.get("ak:" + owner_id, (error, json_keys) => {

			console.log("[DEBUG] APIKey.get", {json_keys});

			if (error) {
				// Disambiguate "Redis is down" from "key does not exist".
				// The legacy fall-through (treat any error as missing -> save)
				// was the root cause of the 2026-05-31 thinx_api OOM: it let
				// create_mqtt_access believe the key was saved and proceed to
				// register an MQTT credential, leaving orphan Mosquitto users
				// behind on every retry.
				if (isRedisUnavailable(error)) {
					console.log(`☣️ [error] [apikey] Redis unavailable on get for owner ${owner_id}: ${error.name || ''} ${error.message || ''}`);
					if (apikey_alias === DEFAULT_MQTT_APIKEY_ALIAS) {
						APIKey._lastDefaultKeyAttempt.set(owner_id, Date.now());
					}
					return callback(false, "redis_unavailable");
				}
				// Any other error: still surface as a failure rather than
				// fabricating a successful save against unknown state.
				console.log(`☣️ [error] [apikey] redis.get error for owner ${owner_id}:`, error && error.message ? error.message : error);
				return callback(false, error);
			}

			// Create new owner object if nothing found and return
			if (json_keys === null) {
				// keys empty, save new array
				console.log("[DEBUG] saving apikeys", [api_key_object]);
				return this.save_apikeys(owner_id, [api_key_object], callback);
			}
			// Update existing key with new data
			let api_keys = JSON.parse(json_keys) || [];

			for (let key in json_keys) {
				if (key.key && crypto.timingSafeEqual(Buffer.from(key.key), Buffer.from(new_api_key))) {
					return callback(false, "key_already_exists");
				}
				if (key.alias && crypto.timingSafeEqual(Buffer.from(key.alias), Buffer.from(apikey_alias))) {
					return callback(false, "alias_already_exists");
				}
			}

			api_keys.push(api_key_object); // new api_key MUST be last!
			this.save_apikeys(owner_id, api_keys, callback);
		
		});
	}

	log_invalid_key(apikey, is_http, owner, callback) {
		this.alog.log(owner, "Attempt to use invalid API Key: " + apikey, "error");
		if (typeof (callback) === "undefined") return;
		if (typeof (is_http) === "undefined" || is_http === false) {
			callback(true); // can be safely ignored, because we use MQTT authentication mechanism here (if properly configured)
		} else {
			console.log(`⚠️ [warning] Invalid API key request with owner ${owner} and key ${apikey}`);
			callback(false, "owner_found_but_no_key"); // no key found
		}
	}

	key_in_keys(apikey, json_keys) {
		var keys = JSON.parse(json_keys);
		for (var ki in keys) {
			let value = keys[ki].key;
			if (value.indexOf(apikey) !== -1) {
				console.log("🔨 [debug] API Key found by Key.");
				return true; // valid key found, early exit
			}
		}
		for (var ha in keys) {
			let value = keys[ha].hash;
			if (value.indexOf(apikey) !== -1) {
				console.log("🔨 [debug] API Key found by Hash.");
				return true; // valid hash found, early exit
			}
		}
		console.log(`⚠️ [warning] APIKey '${apikey}' not found.`);
		return false;
	}

	/**
	 * Verify API Key (should return only boolean if valid)
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {apikey} apikey - apikey
	 * @param {is_http} is_http - used for callback...
	 * @param {function} callback (result, apikey) - async return callback, returns true or false and error
	 */

	verify(owner, apikey, is_http, callback) {

		if ((typeof (owner) === "undefined") || (owner === null)) return callback(false);
		if ((typeof (apikey) === "undefined") || (apikey === null)) return callback(false);

		// Test stack only, does not verify this api_key from envi.json
		if (process.env.ENVIRONMENT === "test") {
			if (apikey.indexOf("a6d548c60da8307394d19894a246c9e9eec6c841b8ad54968e047ce0a1687b94") !== -1) {
				return callback(true, null);
			}
		}

		// Fetch owner keys from redis
		this.redis.get("ak:" + owner, (error, json_keys) => {

			if (error) return callback(false, "apikey_not_found");

			// Check API Key against stored objects
			if ((typeof (json_keys) !== "undefined") && (json_keys !== null)) {
				if (this.key_in_keys(apikey, json_keys)) {
					callback(true, null);
				} else {
					InfluxConnector.statsLog(owner, "APIKEY_INVALID", apikey);
					this.log_invalid_key(apikey, is_http, owner, callback);
				}
				return;
			} else {
				callback(false, "apikey_not_found");
			}
		});
	}

	/**
	 * Revoke API Key
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {string} apikey_hashes -
	 * @param {function} callback - async return callback, returns true or false and error
	 */

	revoke(owner, apikey_hashes, callback) {

		let key_id = "ak:" + owner;

		// Fetch owner keys from redis
		this.redis.get(key_id, (error, json_keys) => {

			if (error) {
				console.log("[APIKey:revoke:error]:" + error + " revoking " + key_id);
				return callback(false, "owner_not_found");
			}

			console.log("🔨 [debug] loaded keys before revocation", json_keys);

			// Check API Key against stored objects
			if ((typeof (json_keys) === "undefined") || (json_keys === null)) {
				console.log("[APIKey:revoke:error]:" + error + " revoking " + key_id);
				return callback(false, "owner_not_found");
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

			this.redis.set(key_id, JSON.stringify(new_keys), () => {
				callback(true, deleted_keys);
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
		this.redis.get("ak:" + owner, (error, json_keys) => {

			if (error) {
				console.log("[APIKey:list:error]:" + error);
				return callback([]);
			}
			
			var exportedKeys = [];
			if ((typeof (json_keys) !== "undefined") && (json_keys !== null)) {
				var api_keys = JSON.parse(json_keys);
				var keys = Object.keys(api_keys);
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
			} else {
				console.log("[DEBUG] Fetched keys:", json_keys);
			}
			callback(exportedKeys);
		});
	}

	// used ONLY by mqtt messageResponder that performs the Registration operation

	get_first_apikey(owner, callback) {
		this.list(owner, (json_keys) => {
			if (json_keys == []) {
				console.log("API Key list failed. " + json_keys);
				return callback(false, "messenger_has_no_api_keys");
			}
			var api_key = (typeof (json_keys[0]) !== "undefined") ? json_keys[0] : null;
			if (api_key === null) {
				callback(false, null);
			} else {
				callback(true, api_key.key);
			}
		});
	}

	// used by builder
	get_last_apikey(owner, callback) {
		this.list(owner, (json_keys) => {
			if (json_keys == []) {
				console.log("API Key list failed. " + json_keys);
				return callback(false, "owner_has_no_api_keys");
			}
			var last_key_hash = owner.last_key_hash;
			var api_key = null;
			for (var key in json_keys) {
				var kdata = json_keys[key];
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
				return callback(false, "build_requires_api_key");
			}
			callback(true, api_key);
		});
	}
};

// Per-owner "last Redis-unavailable timestamp" map for the default-MQTT-key
// circuit breaker. Lives on the class (not the instance) so concurrent
// callers and the create_default_mqtt_apikey re-entry loop all share the
// breaker state inside a single process. See create() for the gate logic.
module.exports._lastDefaultKeyAttempt = new Map();
