/*
 * This THiNX-RTM MQTT Authentication Helper
 * used by disaster recovery among others.
 */

var Globals = require("./globals.js");

var fs = require("fs-extra");
var Sanitka = require("./sanitka");
var sanitka = new Sanitka();
const bcrypt = require('bcrypt');

module.exports = class Auth {

	constructor() {
		let options = Globals.redis_options();
		this.client = require("redis").createClient(options);
	}

	add_mqtt_credentials(_username, password, callback) {

		// Early exit
		if ((typeof (_username) === "undefined") || (_username === null)) {
			throw new Error("DEVELOPER ERROR: Invalid _username provided for hashing:", { username });
		}

		if ((typeof (password) === "undefined") || (password === null)) {
			throw new Error("DEVELOPER ERROR: Invalid password provided for hashing:", { password }, "for username", { username });
		}

		console.log("Adding MQTT credentials", _username, password);

		// Validation/sanitation
		const username = sanitka.username(_username);

		const hasher_cost = 10;
		bcrypt.genSalt(hasher_cost)
			.then(salt => {
				return bcrypt.hash(password, salt);
			})
			.then(hash => {
				this.client.set(username, hash);
				if (typeof (callback) !== "undefined") {
					callback();
				} else {
					console.log("Adding MQTT hash", hash, "NO CALLBACK!");
				}
			})
			.catch(err => {
				console.log("Adding MQTT hash", err);
			});
	}

	revoke_mqtt_credentials(username) {
		this.client.del(username);
		return true;
	}

};
