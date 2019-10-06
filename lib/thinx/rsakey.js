/** This THiNX-RTM API module is responsible for managing RSA Keys. */

var Globals = require("./globals.js");
var exec = require("child_process");
var fs = require("fs-extra");

module.exports = class RSAKey {

	constructor() {
		this.ssh_keys = Globals.app_config().ssh_keys;
	}

	getKeyPathsForOwner(owner) {
		console.log("getKeyPathsForOwner from path "+this.ssh_keys+" with owner "+owner);
		var files = fs.readdirSync(this.ssh_keys);
		var result = files.filter(
			file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
		);
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
				fingerprint: key_data.toString('utf8'), // TODO: FIXME: needs proper fingerprint, what is this?
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
		//console.log("Keypaths exist: "+JSON.stringify({key_paths}));
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

	revoke(owner, revoked_filenames, callback) {
		if (!this.keyPathsExist(owner)) {
			console.log("no_rsa_keys_found");
			callback(true, false);
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

	create(owner, callback) {
		const date = new Date();
		const filename = owner + "-" + date.getTime();
		const keyname = this.ssh_keys + "/" + filename;
		const GENERATE_KEYS = 'cd ' + this.ssh_keys + ' && ssh-keygen -C "' + owner + '@' + process.env.THINX_HOSTNAME + '" -q -N "" -t rsa -f ' + keyname;
		const result = exec.execSync(GENERATE_KEYS); // TODO: use as result...
		var public_key = fs.readFileSync(keyname + ".pub").toString('utf8');
		callback(true, {
			name: date,
			pubkey: public_key,
			filename: filename
		});
	}

};
