/** This THiNX-RTM API module is responsible for managing RSA Keys. */

let Globals = require("./globals.js");

const exec = require("child_process");
const fs = require("fs-extra");
const sha256 = require("sha256");
const Sanitka = require("./sanitka"); const sanitka = new Sanitka();
module.exports = class RSAKey {

	constructor() {
		this.ssh_keys = Globals.app_config().ssh_keys;
		console.log("✅ [info] Loaded module: RSAKey");
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
			var path = this.ssh_keys + "/" + key_paths[kindex] + ".pub";
			const key_data = fs.readFileSync(path);
			var tstamp = parseInt(key_paths[kindex].replace(owner+"-", ""), 10);
			var info = {
				name: new Date(tstamp).toString(),
				fingerprint: sha256(key_data.toString('utf8')),
				date: new Date(tstamp).toString(),
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
			callback(res, true, false);
			return;
		}
		this.revokeUserKeysAndCallback(revoked_filenames, owner, callback);
	}

	list(owner, callback) {
		var key_paths = this.getKeyPathsForOwner(owner);
		if (key_paths.count < 1) {
			console.log("no_rsa_key_found");
			callback(true, []);
			return;
		}
		callback(true, this.exportKeysForList(key_paths, owner));
	}

	validateOwner(owner) {
		if (owner.indexOf(";") !== -1) return false;
		if (owner.indexOf("&") !== -1) return false;
		if (owner.indexOf("-") !== -1) return false;
		if (owner.indexOf(" ") !== -1) return false;
		return true;
	}

	create(i_owner, callback) {
		const ownerValid = this.validateOwner(i_owner);
		if (!ownerValid) {
			console.log("Invalid owner in RSA Key Create.");
			return;
		}
		const owner = sanitka.owner(i_owner);
		const date = new Date().getTime();
		const filename = owner + "-" + date;
		const keyname = this.ssh_keys + "/" + filename;
		const result = exec.execSync(
			`cd ${this.ssh_keys} && ssh-keygen -C "${owner}@${process.env.THINX_HOSTNAME}" -q -N "" -t rsa -f ${keyname}`
		).toString();
		if (result !== '') {
			console.log(`🚫 [critical] API Key create error result: %s`, result);
			callback(false, {
				error: "contact_admin"
			});
			return;
		}
		callback(true, {
			name: date,
			pubkey: fs.readFileSync(keyname + ".pub").toString('utf8'),
			filename: filename
		});
	}

};
