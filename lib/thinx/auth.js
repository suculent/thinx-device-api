/*
 * This THiNX-RTM MQTT Authentication Helper
 * used by disaster recovery among others.
 */

var Globals = require("./globals.js");

var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
const bcrypt = require('bcrypt');

module.exports = class Auth {

	constructor(client) {
		if (typeof (client) === "undefined") {
			let options = Globals.redis_options();
			this.client = require("redis").createClient(options);
		} else {
			this.client = client;
		}
	}

	add_mqtt_credentials(_username, password, callback) {

		if ((typeof (_username) !== "string") || (_username === null)) {
			console.log(`🚫 [critical] DEVELOPER ERROR: No _username provided for hashing.`);
			return;
		}

		if ((typeof (password) !== "string") || (password === null)) {
			console.log(`🚫 [critical] DEVELOPER ERROR: No password provided for hashing for username ${username}`);
			return;
		}

		if (process.env.ENVIRONMENT == "test") {
			if (_username == "thinx") {
				// deepcode ignore NoHardcodedPasswords: <please specify a reason of ignoring this>
				password = "mosquitto"; // inject test password for thinx to make sure no random stuff is injected in test (until this constant shall be removed everywhere)
			}
		}

		// Validation/sanitation
		const hasher_cost = 10; // depends on mosquitto's auth_opt_hasher_cost
		bcrypt.genSalt(hasher_cost)
			.then(salt => {
				// deepcode ignore HardcodedNonCryptoSecret: <please specify a reason of ignoring this>
				return bcrypt.hash(password, salt);
			})
			.then(hash => {
				const username = sanitka.username(_username);
				this.client.set(username, hash);
				if (typeof (callback) !== "undefined") {
					callback();
				}
			})
			.catch(err => {
				console.log(`[error] Adding MQTT hash ${err}`);
			});
	}

	revoke_mqtt_credentials(username) {
		this.client.del(username);
		return true;
	}

};
