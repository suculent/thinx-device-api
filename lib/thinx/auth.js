/*
 * This THiNX-RTM MQTT Authentication Helper
 * used by disaster recovery among others.
 */

var Globals = require("./globals.js");

var Sanitka = require("./sanitka");
var sanitka = new Sanitka();
const bcrypt = require('bcrypt');

module.exports = class Auth {

	constructor(client) {
		if (typeof(client) === "undefined") {
			let options = Globals.redis_options();
			this.client = require("redis").createClient(options);
		} else {
			this.client = client;
		}
	}

	add_mqtt_credentials(_username, password, callback) {

		// Early exit
		if ((typeof (_username) === "undefined") || (_username === null)) {
			throw new Error("[critical] DEVELOPER ERROR: Invalid _username provided for hashing:", { username });
		}

		if ((typeof (password) === "undefined") || (password === null)) {
			throw new Error("[critical] DEVELOPER ERROR: Invalid password provided for hashing:", { password }, "for username", { username });
		}

		if (process.env.ENVIRONMENT == "test") {
			if (_username == "thinx") {
				password = "mosquitto"; // inject test password for thinx to make sure no random stuff is injected in test (until this constant shall be removed everywhere)
			}
		}

		console.log("[debug] Adding MQTT credential", password, "for", _username);

		// Validation/sanitation
		const hasher_cost = 10;
		bcrypt.genSalt(hasher_cost)
			.then(salt => {
				return bcrypt.hash(password, salt);
			})
			.then(hash => {
				const username = sanitka.username(_username);
				this.client.set(username, hash);
				if (typeof (callback) !== "undefined") {
					callback();
				} else {
					console.log("[debug] Adding MQTT hash", hash, "NO CALLBACK!");
				}
			})
			.catch(err => {
				console.log("[debug] Adding MQTT hash", err);
			});
	}

	revoke_mqtt_credentials(username) {
		this.client.del(username);
		return true;
	}

};
