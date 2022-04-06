/** This THiNX Device Management API module is responsible for managing RSA Keys. */

let Globals = require("./globals.js");

const exec = require("child_process");
const fs = require("fs-extra");
const sha256 = require("sha256");
var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
module.exports = class RSAKey {

	constructor() {
		this.ssh_keys = Globals.app_config().ssh_keys;

	}

	getKeyPathsForOwner(owner) {
		var files = fs.readdirSync(this.ssh_keys);
		var result = files.filter(
			file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
		);
		if (typeof(result) === "undefined") result = 0;
		return result;
	}

	revokeUserKeys(revoked_filenames, owner) {
		var revoked_keys = [];
		var key_paths = this.getKeyPathsForOwner(owner);
		for (var kindex in revoked_filenames) {
			var path = this.ssh_keys + "/" + key_paths[kindex];
			fs.unlinkSync(path);
			fs.unlinkSync(path + ".pub");
			revoked_keys.push(key_paths[kindex]);
		}
		return revoked_keys;
	}

	exportKeysForList(key_paths, owner) {
		var exportedKeys = [];
		for (var kindex in key_paths) {
			const key_data = fs.readFileSync(this.ssh_keys + "/" + key_paths[kindex] + ".pub");
			var date = new Date(parseInt(key_paths[kindex].replace(owner+"-", ""), 10)).toString();
			var info = {
				name: date,
				fingerprint: sha256(key_data.toString('utf8')),
				date: date,
				pubkey: key_data.toString('utf8'),
				filename: key_paths[kindex]
			};
			exportedKeys.push(info);
		}
		return exportedKeys;
	}

	keyPathsExist(owner) {
		var key_paths = this.getKeyPathsForOwner(owner);
		if (typeof(key_paths) === "undefined") return 0;
		return (key_paths.length > 0);
	}

	revokeUserKeysAndCallback(revoked_filenames, owner, callback) {
		var revoked_keys = this.revokeUserKeys(revoked_filenames, owner);
		if (typeof(callback) === "function") {
			var success = (revoked_keys.length > 0) ? true : false;
			callback(success, revoked_keys);
		}
	}

	// public

	/**
	 * Revoke RSA Key for owner
	 * @param {string} owner - owner._id
	 * @param {string} revoked_filenames - array od RSA Key fingerprints to be revoked
	 * @param {function} callback(success, message) - operation result callback
	 */

	revoke(owner, revoked_filenames, callback, res) {
		if (!this.keyPathsExist(owner)) {
			console.log("no_rsa_keys_found");
			return callback(res, true, false);
		}
		this.revokeUserKeysAndCallback(revoked_filenames, owner, callback);
	}

	list(owner, callback) {
		var key_paths = this.getKeyPathsForOwner(owner);
		if (key_paths.count < 1) {
			console.log("no_rsa_key_found");
			return callback(true, []);
		}
		callback(true, this.exportKeysForList(key_paths, owner));
	}

	validateOwner(owner) {
		let valid = Sanitka.owner(owner);
		return (valid == null) ? false : true;
	}

	create(i_owner, callback) {
		const date = new Date().getTime();
		const owner = sanitka.owner(i_owner);
		const filename = owner + "-" + date;
		const keyname = this.ssh_keys + "/" + filename;
		let result = exec.execSync(`cd ${this.ssh_keys} && ssh-keygen -C "${owner}@${process.env.THINX_HOSTNAME}" -q -N "" -t rsa -f ${keyname}`).toString();
		if (result !== '') {
			console.log(`🚫 [critical] API Key create error result: ${result}`);
			return callback(false, { error: "contact_admin" });
		}
		callback(true, {
			name: date,
			pubkey: fs.readFileSync(keyname + ".pub").toString('utf8'),
			filename: filename
		});
	}

};
