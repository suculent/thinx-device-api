/** This THiNX Device Management API module is responsible for managing API Keys.
	This is the new version that will use Redis only. */

var Globals = require("./globals.js");
var AuditLog = require("./audit");
var sha256 = require("sha256");
const crypto = require('crypto');

const InfluxConnector = require('./influx');
const EventTaxonomy = require('./event_taxonomy.js');
const Util = require("./util.js");
const Sanitka = require("./sanitka");

// Aliases that trigger the per-owner circuit breaker.
// Only the "Default MQTT API Key" auto-create path is gated (see incident
// 2026-05-31 thinx_api OOM) — user-driven create() calls remain unaffected
// so the operator can still issue manual API keys when Redis is healthy.
const DEFAULT_MQTT_APIKEY_ALIAS = "Default MQTT API Key";
const DEFAULT_KEY_BREAKER_WINDOW_MS = 60 * 1000;

// CI-only API key (spec/_envi.json `ak`). Accepted without a Redis lookup only
// when ENVIRONMENT === "test", and only as an exact whole-value match (CR-01).
const TEST_ENV_APIKEY = "a6d548c60da8307394d19894a246c9e9eec6c841b8ad54968e047ce0a1687b94";

// Multi-key compare-and-swap (quick 261003-u86). With n = #KEYS: every KEYS[i] must
// currently hold ARGV[i] (an absent key reads as ""); only then is ARGV[n+i] written to
// each key ("" deletes it) and 1 is answered, otherwise nothing is written and 0 is
// answered. The JSON values are built in JS (JSON.stringify, the format save_apikeys
// writes), so Lua never re-encodes them. It is issued as one EVAL through sendCommand:
// the shared legacy client multiplexes one connection, so WATCH/MULTI is not safe here.
const KEY_STORE_CAS_SCRIPT = [
	"local n = #KEYS",
	"for i = 1, n do",
	"  local current = redis.call('GET', KEYS[i])",
	"  if not current then current = '' end",
	"  if current ~= ARGV[i] then return 0 end",
	"end",
	"for i = 1, n do",
	"  local nextval = ARGV[n + i]",
	"  if nextval == '' then redis.call('DEL', KEYS[i]) else redis.call('SET', KEYS[i], nextval) end",
	"end",
	"return 1"
].join("\n");

function isEntry(entry) {
	return (typeof (entry) === "object") && (entry !== null) && !Array.isArray(entry);
}

function nonEmptyString(value) {
	return (typeof (value) === "string") && (value.length > 0);
}

// Parses a raw ak: value: null (absent) -> [], a JSON array -> that array, anything
// else -> null (malformed).
function parseKeyStore(raw) {
	if ((typeof (raw) === "undefined") || (raw === null)) return [];
	if (typeof (raw) !== "string") return null;
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : null;
	} catch (_e) {
		return null;
	}
}

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
				console.error("☣️ [error] [apikey] save_apikeys redis.set failed:", error && error.message ? error.message : error);
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
				console.error(`☣️ [error] [apikey] circuit-breaker OPEN for owner ${owner_id} — skipping default MQTT key create (Redis recently unavailable)`);
				return callback(false, "redis_unavailable_backoff");
			}
		}

		var new_api_key = this.create_key(owner_id);

		if (typeof (new_api_key) === "undefined") console.error("☣️ [error] API Key generator error. Check test_ prefix for new_api_key.");
		if (typeof (owner_id) === "undefined") console.error("☣️ [error] API Key generator error. Check owner_id");

		var api_key_object = {
			"key": new_api_key,
			"hash": sha256(new_api_key),
			"alias": apikey_alias
		};

		// Fetch owner keys from redis
		this.redis.get("ak:" + owner_id, (error, json_keys) => {

			// SEC: do not log json_keys — it contains cleartext API keys and hashes.

			if (error) {
				// Disambiguate "Redis is down" from "key does not exist".
				// The legacy fall-through (treat any error as missing -> save)
				// was the root cause of the 2026-05-31 thinx_api OOM: it let
				// create_mqtt_access believe the key was saved and proceed to
				// register an MQTT credential, leaving orphan Mosquitto users
				// behind on every retry.
				if (isRedisUnavailable(error)) {
					console.error(`☣️ [error] [apikey] Redis unavailable on get for owner ${owner_id}: ${error.name || ''} ${error.message || ''}`);
					if (apikey_alias === DEFAULT_MQTT_APIKEY_ALIAS) {
						APIKey._lastDefaultKeyAttempt.set(owner_id, Date.now());
					}
					return callback(false, "redis_unavailable");
				}
				// Any other error: still surface as a failure rather than
				// fabricating a successful save against unknown state.
				console.error(`☣️ [error] [apikey] redis.get error for owner ${owner_id}:`, error && error.message ? error.message : error);
				return callback(false, error);
			}

			// Create new owner object if nothing found and return
			if (json_keys === null) {
				// keys empty, save new array
				// SEC: log only the alias, never the cleartext key/hash in api_key_object.
				console.log(`🔨 [debug] [apikey] saving first API key for owner ${owner_id} (alias: ${apikey_alias})`);
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

	/**
	 * Audit-log a rejected API key and answer the verify callback with failure.
	 * @param {string} apikey - the rejected key (only a redacted prefix is logged)
	 * @param {boolean} is_http - kept for caller compatibility; it no longer changes
	 *   the outcome. A mismatch fails for every caller (CR-01: the old non-HTTP
	 *   branch answered success, and no MQTT caller of verify exists).
	 * @param {string} owner - owner_id
	 * @param {function} callback (false, "owner_found_but_no_key")
	 */
	log_invalid_key(apikey, is_http, owner, callback) {
		// SEC: redact the attempted key — never persist/print a full API key value.
		this.alog.log(owner, "Attempt to use invalid API Key: " + Util.redactToken(apikey), "error");
		console.warn(`⚠️ [warning] Invalid API key request with owner ${owner} and key ${Util.redactToken(apikey)}`);
		if (typeof (callback) === "undefined") return;
		callback(false, "owner_found_but_no_key"); // no key found
	}

	/**
	 * True only when `apikey` equals, as a whole value and in constant time, the
	 * stored `.key` or `.hash` of one of the owner's entries (CR-01).
	 */
	key_in_keys(apikey, json_keys) {
		if ((typeof (apikey) !== "string") || (apikey.length === 0)) return false;
		let keys;
		try {
			keys = JSON.parse(json_keys);
		} catch (_e) {
			console.warn("⚠️ [warning] [apikey] stored API keys are not valid JSON.");
			return false;
		}
		if (!Array.isArray(keys)) return false;
		for (const entry of keys) {
			if ((typeof (entry) !== "object") || (entry === null)) continue;
			if (Util.safeEqual(entry.key, apikey)) {
				console.log("🔨 [debug] API Key found by Key.");
				return true; // valid key found, early exit
			}
			if (Util.safeEqual(entry.hash, apikey)) {
				console.log("🔨 [debug] API Key found by Hash.");
				return true; // valid hash found, early exit
			}
		}
		console.warn(`⚠️ [warning] APIKey '${Util.redactToken(apikey)}' not found.`);
		return false;
	}

	/**
	 * Verify API Key (should return only boolean if valid)
	 * @param {string} owner - owner_id (may be optional but speeds things up... will be owner id!)
	 * @param {apikey} apikey - apikey
	 * @param {is_http} is_http - informational only; a mismatch fails for every caller
	 * @param {function} callback (result, message, current_owner) - async return callback
	 * @param {object} [device_context] - optional {udid, currentOwner(udid, cb)} of the device
	 *   presenting the key (quick 261003-u86, Device#deviceKeyContext). When the key does not
	 *   verify for `owner`, a key moved with this very device by a transfer away from `owner`
	 *   answers callback(true, "transfer_redirect", current_owner); see transferRedirect.
	 *   Without it the behaviour is unchanged.
	 */

	verify(owner, apikey, is_http, callback, device_context) {

		if ((typeof (owner) === "undefined") || (owner === null)) return callback(false);
		if ((typeof (apikey) !== "string") || (apikey.length === 0)) return callback(false);

		// Test stack only, does not verify this api_key from envi.json (exact match only)
		if (process.env.ENVIRONMENT === "test") {
			if (Util.safeEqual(apikey, TEST_ENV_APIKEY)) {
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
					this.transferRedirect(owner, apikey, device_context, (current_owner) => {
						if (current_owner !== null) return callback(true, "transfer_redirect", current_owner);
						// D-12: never pass the rejected key to stats (no tag, no console detail);
						// log_invalid_key below keeps the only, redacted mention.
						InfluxConnector.statsLog(owner, EventTaxonomy.NAMES.APIKEY_INVALID);
						this.log_invalid_key(apikey, is_http, owner, callback);
					});
				}
				return;
			} else {
				this.transferRedirect(owner, apikey, device_context, (current_owner) => {
					if (current_owner !== null) return callback(true, "transfer_redirect", current_owner);
					callback(false, "apikey_not_found");
				});
			}
		});
	}

	/**
	 * Old-owner continuity for transferred devices (quick 261003-u86). Called only after
	 * `apikey` failed to verify for `presented_owner`. Calls back with the device's current
	 * owner id when ALL of these hold, else with null:
	 * - a device context with a valid udid was given (MAC-only registrations never qualify);
	 * - that udid's document is owned by a valid owner id other than presented_owner;
	 * - that owner's store holds exactly one entry whose .key or .hash equals `apikey`
	 *   (Util.safeEqual), bound by a transfer to this udid and listing presented_owner.
	 * Any Redis or CouchDB error answers null (fail closed). The binding stays until the
	 * key is revoked, the owner is purged or the device is transferred again (operator
	 * decision: no consumption). The redirect grants nothing beyond what the key itself
	 * grants: it already verifies for the current owner directly.
	 */
	transferRedirect(presented_owner, apikey, device_context, callback) {
		if ((typeof (device_context) !== "object") || (device_context === null)) return callback(null);
		if (typeof (device_context.currentOwner) !== "function") return callback(null);
		const udid = (typeof (device_context.udid) === "string") ? Sanitka.udid(device_context.udid) : null;
		if (udid === null) return callback(null);

		let answered = false;
		const answer = (value) => {
			if (answered) return;
			answered = true;
			callback(value);
		};

		try {
			device_context.currentOwner(udid, (current) => {
				const current_owner = (typeof (current) === "string") ? Sanitka.owner(current) : null;
				if ((current_owner === null) || (current_owner !== current) || (current_owner === presented_owner)) return answer(null);
				this.redis.get("ak:" + current_owner, (error, json_keys) => {
					if (error) return answer(null);
					const entries = parseKeyStore(json_keys);
					if ((entries === null) || !APIKey.findTransferBinding(entries, apikey, udid, presented_owner)) return answer(null);
					this.alog.log(current_owner, "Device " + udid + " authenticated with a previous owner id; answered as current owner");
					console.log(`ℹ️ [info] [apikey] device ${udid} presented a previous owner id; answered as its current owner`);
					answer(current_owner);
				});
			});
		} catch (e) {
			console.log("☣️ [error] [apikey] transfer redirect lookup failed:", e && e.message ? e.message : e);
			answer(null);
		}
	}

	/*
	 * Device keys and transfers (quick 261003-u86).
	 *
	 * A device document carries lastkey = sha256(<Authentication header>), and since CR-01
	 * (quick 261003-s59) that header equals an entry's .key or .hash exactly. So lastkey is
	 * sha256(key) (== entry.hash) or sha256(hash). Matching is exact (Util.safeEqual); a
	 * masked or partial key never identifies an entry.
	 */

	/** The values a device's lastkey can take for this entry: sha256(key), hash, sha256(hash). */
	static deviceKeyCandidates(entry) {
		const out = [];
		if (!isEntry(entry)) return out;
		const add = (value) => {
			if (nonEmptyString(value) && (out.indexOf(value) === -1)) out.push(value);
		};
		if (nonEmptyString(entry.key)) add(sha256(entry.key));
		add(entry.hash);
		if (nonEmptyString(entry.hash)) add(sha256(entry.hash));
		return out;
	}

	/**
	 * The entry a device's lastkey identifies: {status: "found", index, entry} for exactly
	 * one match, {status: "ambiguous"} for several, {status: "not_identified"} otherwise.
	 */
	static findDeviceKey(entries, lastkey) {
		if (!nonEmptyString(lastkey) || !Array.isArray(entries)) return { status: "not_identified" };
		let found = null;
		let matches = 0;
		for (let index = 0; index < entries.length; index++) {
			const entry = entries[index];
			if (!isEntry(entry)) continue;
			const hit = APIKey.deviceKeyCandidates(entry).some((candidate) => Util.safeEqual(candidate, lastkey));
			if (hit) {
				matches++;
				if (found === null) found = { status: "found", index: index, entry: entry };
			}
		}
		if (matches === 0) return { status: "not_identified" };
		if (matches > 1) return { status: "ambiguous" };
		return found;
	}

	/** True for the owner's Default MQTT API Key (same rule as Owner#mqtt_key). */
	static isOwnerMqttKey(entry) {
		return isEntry(entry) && (typeof (entry.alias) === "string") && (entry.alias.indexOf(DEFAULT_MQTT_APIKEY_ALIAS) !== -1);
	}

	/**
	 * True only when exactly one entry's .key or .hash equals `apikey` (Util.safeEqual) and
	 * that entry carries a transfer binding naming `udid` whose `from` lists
	 * `presented_owner` (strict equality).
	 */
	static findTransferBinding(entries, apikey, udid, presented_owner) {
		if (!Array.isArray(entries)) return false;
		if (!nonEmptyString(apikey) || !nonEmptyString(udid) || !nonEmptyString(presented_owner)) return false;
		const matching = entries.filter((entry) => isEntry(entry) && (Util.safeEqual(entry.key, apikey) || Util.safeEqual(entry.hash, apikey)));
		if (matching.length !== 1) return false;
		const binding = matching[0].transfer;
		if (!isEntry(binding)) return false;
		if (binding.udid !== udid) return false;
		if (!Array.isArray(binding.from)) return false;
		return binding.from.indexOf(presented_owner) !== -1;
	}

	/**
	 * MQTT old-owner continuity for transferred devices (quick 261003-vbg; operator decision
	 * 2026-10-03). An MQTT message carries no key, so the device's own key is the entry its
	 * `lastkey` identifies in ak:<current_owner> (findDeviceKey); the message is bound when that
	 * entry carries a transfer binding for exactly `udid` listing `presented_owner`
	 * (findTransferBinding). One GET of ak:<current_owner>, never another owner's store.
	 * Calls back exactly once with (error|null, boolean): invalid input, presented ==
	 * current or a missing lastkey answer (null, false) without Redis; a Redis error or a
	 * malformed store answers (error, false). Logs nothing and writes no audit entry: it runs
	 * per MQTT status message.
	 */
	checkTransferBinding(current_owner, udid, lastkey, presented_owner, callback) {
		let answered = false;
		const answer = (error, bound) => {
			if (answered) return;
			answered = true;
			callback(error, bound === true);
		};
		if (!nonEmptyString(current_owner) || !nonEmptyString(presented_owner) || (current_owner === presented_owner)) return answer(null, false);
		// silent shape test first, so Sanitka.udid never reaches its warning line
		if ((typeof (udid) !== "string") || !/^[a-fA-F0-9-]{36}$/.test(udid) || (Sanitka.udid(udid) === null)) return answer(null, false);
		if (!nonEmptyString(lastkey)) return answer(null, false);
		try {
			this.redis.get("ak:" + current_owner, (error, json_keys) => {
				if (error) return answer(error, false);
				let result;
				try {
					const entries = parseKeyStore(json_keys);
					if (entries === null) {
						result = { error: new Error("malformed key store"), bound: false };
					} else {
						const found = APIKey.findDeviceKey(entries, lastkey);
						if (found.status !== "found") {
							result = { error: null, bound: false };
						} else {
							const identity = nonEmptyString(found.entry.hash) ? found.entry.hash : found.entry.key;
							result = { error: null, bound: APIKey.findTransferBinding(entries, identity, udid, presented_owner) };
						}
					}
				} catch (e) {
					result = { error: e, bound: false };
				}
				answer(result.error, result.bound);
			});
		} catch (e) {
			answer(e, false);
		}
	}

	// One EVAL of KEY_STORE_CAS_SCRIPT; calls back (error, reply) with reply 1 or 0.
	compareAndSwap(keys, expected, next, callback) {
		const args = ["EVAL", KEY_STORE_CAS_SCRIPT, String(keys.length)].concat(keys, expected, next);
		try {
			this.redis.sendCommand(args, (error, reply) => callback(error || null, Number(reply)));
		} catch (e) {
			callback(e);
		}
	}

	// Raw values of both stores (null when absent).
	readKeyStores(from_owner, to_owner, callback) {
		this.redis.get("ak:" + from_owner, (error_from, raw_from) => {
			if (error_from) return callback(error_from);
			this.redis.get("ak:" + to_owner, (error_to, raw_to) => {
				if (error_to) return callback(error_to);
				callback(null, (typeof (raw_from) === "string") ? raw_from : null, (typeof (raw_to) === "string") ? raw_to : null);
			});
		});
	}

	/**
	 * Moves the entry identified by `lastkey` from ak:<from_owner> to ak:<to_owner> in one
	 * EVAL compare-and-swap of both stores, so the entry is never in both or in neither.
	 * The moved entry keeps its key, hash and other fields and gains
	 * transfer: {udid, from: [previous owners], at} in the same swap (`from` accumulates
	 * across chained transfers of the same udid and never lists the new owner). On an alias
	 * collision at the recipient the moved alias gets " (transferred <udid prefix>)".
	 *
	 * Failure handling: a compare mismatch retries from a fresh read (3 attempts in all); a
	 * transport error is resolved by re-reading both stores. Refuses with
	 * apikey_not_identified, apikey_ambiguous, apikey_owner_mqtt_key or apikey_move_failed.
	 * Calls back (true, move) or (false, reason). Never logs a key, a hash or a stored value.
	 *
	 * options.strip (internal, used by restoreDeviceKey): move the entry back without any
	 * transfer binding.
	 */
	moveDeviceKey(from_owner, to_owner, lastkey, udid, callback, options) {

		const strip = (typeof (options) === "object") && (options !== null) && (options.strip === true);
		const MAX_ATTEMPTS = 3;

		const failed = (reason) => {
			console.log(`⚠️ [warning] [apikey] key move for device ${udid} refused: ${reason}`);
			callback(false, reason);
		};

		const critical = (what) => {
			console.log(`🚫  [critical] [apikey] ${what} for device ${udid} between owners ${from_owner} and ${to_owner}; reconcile manually`);
		};

		if (!nonEmptyString(from_owner) || !nonEmptyString(to_owner) || (from_owner === to_owner)) return failed("apikey_move_failed");

		const sameKey = (a, b) => isEntry(a) && isEntry(b) && (Util.safeEqual(a.hash, b.hash) || Util.safeEqual(a.key, b.key));

		// After a transport error the swap may or may not have applied: decide by re-reading.
		const reconcile = (entry, move) => {
			this.readKeyStores(from_owner, to_owner, (read_error, raw_from, raw_to) => {
				const from_entries = read_error ? null : parseKeyStore(raw_from);
				const to_entries = read_error ? null : parseKeyStore(raw_to);
				if ((from_entries === null) || (to_entries === null)) {
					critical("key move outcome unknown (re-read failed)");
					return failed("apikey_move_failed");
				}
				const in_from = from_entries.filter((e) => sameKey(e, entry)).length;
				const in_to = to_entries.filter((e) => sameKey(e, entry)).length;
				if ((in_from === 0) && (in_to === 1)) {
					move.after = [(raw_from === null) ? "" : raw_from, (raw_to === null) ? "" : raw_to];
					console.log(`ℹ️ [info] [apikey] API key of device ${udid} moved (confirmed by re-read)`);
					return callback(true, move);
				}
				if ((in_from === 1) && (in_to === 0)) return failed("apikey_move_failed");
				critical("key move outcome inconsistent");
				failed("apikey_move_failed");
			});
		};

		const attempt = (attempt_no) => {

			this.readKeyStores(from_owner, to_owner, (read_error, raw_from, raw_to) => {

				if (read_error) return failed("apikey_move_failed");

				const from_entries = parseKeyStore(raw_from);
				const to_entries = parseKeyStore(raw_to);
				if ((from_entries === null) || (to_entries === null)) return failed("apikey_move_failed");

				const found = APIKey.findDeviceKey(from_entries, lastkey);
				if (found.status === "ambiguous") return failed("apikey_ambiguous");
				if (found.status !== "found") return failed("apikey_not_identified");
				if (!strip && APIKey.isOwnerMqttKey(found.entry)) return failed("apikey_owner_mqtt_key");

				// The recipient must not already hold the same key or hash.
				if (to_entries.some((e) => sameKey(e, found.entry))) return failed("apikey_move_failed");

				const at = new Date().toISOString();
				const moved = Object.assign({}, found.entry);
				if (strip) {
					delete moved.transfer;
				} else {
					let previous = [from_owner];
					const binding = found.entry.transfer;
					if (isEntry(binding) && (binding.udid === udid) && Array.isArray(binding.from)) {
						previous = binding.from.concat([from_owner]);
					}
					const from_list = [];
					for (const owner of previous) {
						if (nonEmptyString(owner) && (owner !== to_owner) && (from_list.indexOf(owner) === -1)) from_list.push(owner);
					}
					moved.transfer = { udid: udid, from: from_list, at: at };
				}
				if ((typeof (moved.alias) === "string") && to_entries.some((e) => isEntry(e) && (e.alias === moved.alias))) {
					moved.alias = moved.alias + " (transferred " + String(udid).substring(0, 8) + ")";
				}

				const next_from = JSON.stringify(from_entries.filter((_entry, index) => index !== found.index));
				const next_to = JSON.stringify(to_entries.concat([moved]));
				const keys = ["ak:" + from_owner, "ak:" + to_owner];
				const before = [(raw_from === null) ? "" : raw_from, (raw_to === null) ? "" : raw_to];
				const move = {
					from_owner: from_owner,
					to_owner: to_owner,
					keys: keys,
					before: before,
					after: [next_from, next_to],
					lastkey: lastkey,
					udid: udid,
					at: at
				};

				this.compareAndSwap(keys, before, move.after, (swap_error, reply) => {
					if (swap_error) return reconcile(found.entry, move);
					if (reply === 1) {
						console.log(`ℹ️ [info] [apikey] API key of device ${udid} moved to its ${strip ? "previous" : "new"} owner`);
						return callback(true, move);
					}
					if (attempt_no < MAX_ATTEMPTS) return attempt(attempt_no + 1);
					failed("apikey_move_failed");
				});
			});
		};

		attempt(1);
	}

	/**
	 * Undoes a moveDeviceKey result after the owner change failed. First one EVAL that
	 * swaps both stores back to the exact pre-move values (only if nothing else changed
	 * them since). If that is refused, the entry moves back by lastkey with its transfer
	 * binding removed, keeping any other change. Calls back (true, "restored" |
	 * "moved_back") or (false, reason).
	 */
	restoreDeviceKey(move, callback) {
		if ((typeof (move) !== "object") || (move === null) || !Array.isArray(move.keys)) return callback(false, "apikey_move_failed");
		this.compareAndSwap(move.keys, move.after, move.before, (swap_error, reply) => {
			if (!swap_error && (reply === 1)) {
				console.log(`ℹ️ [info] [apikey] API key of device ${move.udid} restored to its previous owner`);
				return callback(true, "restored");
			}
			this.readKeyStores(move.from_owner, move.to_owner, (read_error, raw_from, raw_to) => {
				if (!read_error && (((raw_from === null) ? "" : raw_from) === move.before[0]) && (((raw_to === null) ? "" : raw_to) === move.before[1])) {
					return callback(true, "restored");
				}
				this.moveDeviceKey(move.to_owner, move.from_owner, move.lastkey, move.udid, (moved, result) => {
					if (moved) return callback(true, "moved_back");
					callback(false, result);
				}, { strip: true });
			});
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
				console.error("☣️ [error] [APIKey:revoke]:" + error + " revoking " + key_id);
				return callback(false, "owner_not_found");
			}

			// SEC: do not log json_keys — it contains cleartext API keys and hashes.

			// Check API Key against stored objects
			if ((typeof (json_keys) === "undefined") || (json_keys === null)) {
				console.error("☣️ [error] [APIKey:revoke]: no keys found revoking " + key_id);
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
				console.error("☣️ [error] [APIKey:list]:" + error);
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
