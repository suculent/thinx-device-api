/*
 * This THiNX MQTT Authentication Helper
 * used by disaster recovery among others.
 */

const Sanitka = require("./sanitka");
let sanitka = new Sanitka();

const bcrypt = require('bcrypt');

module.exports = class Auth {

	constructor(redis) {
		if ((typeof (redis) === "undefined") || (redis === null)) {
			throw new Error("Auth requires connected Redis client.");
		} 
		this.redis = redis;
	}

	add_mqtt_credentials(_username, password, callback) {

		// deepcode ignore NoHardcodedPasswords: inject test password for thinx to make sure no random stuff is injected in test (until this constant shall be removed everywhere)
		if ((process.env.ENVIRONMENT == "test") && (_username == "thinx")) password = "mosquitto";
			
		let username = sanitka.username(_username);

		// Validation/sanitation
		const hasher_cost = 10; // depends on mosquitto's auth_opt_hasher_cost

		bcrypt.genSalt(hasher_cost)
		.then((salt) => {
			// deepcode ignore HardcodedNonCryptoSecret: <please specify a reason of ignoring this>
			return bcrypt.hash(password, salt);
		})
		.then((hash) => {
			console.log(`ℹ️ [info] Preparing authentication state for username/udid ${username}`);
			this.redis.set(username, hash);
			if (typeof (callback) !== "undefined") {
				callback();
			}
		})
		.catch(err => { 
			console.log(`[error] Adding MQTT hash ${err}`); 
		});
	}

	revoke_mqtt_credentials(username) {
		this.redis.del(username, (error, result) => {
			return result;
		});
	}

};
