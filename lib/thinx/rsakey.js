/** This THiNX Device Management API module is responsible for managing RSA Keys. */

const fs = require("fs-extra");
const sha256 = require("sha256");
const { generateKeyPair } = require('crypto');
//const forge = require('node-forge');

let Globals = require("./globals");
const Util = require("./util");
const Sanitka = require("./sanitka"); var sanitka = new Sanitka();
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
		console.log("[debug] revokeUserKeys Revoked filenames: ", revoked_filenames);
		for (var kindex in revoked_filenames) {
			if (!Util.isDefined(key_paths[kindex])) continue;
			var priv_path = this.ssh_keys + "/" + key_paths[kindex];
			var pub_path = this.ssh_keys + "/" + key_paths[kindex] + ".pub";
			if (fs.existsSync(priv_path)) fs.unlinkSync(priv_path);
			if (fs.existsSync(pub_path)) fs.unlinkSync(pub_path);
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

	revokeUserKeysAndCallback(res, revoked_filenames, owner, callback) {
		var revoked_keys = this.revokeUserKeys(revoked_filenames, owner);
		if (typeof(callback) === "function") {
			var success = (revoked_keys.length > 0) ? true : false;
			callback(res, success, revoked_keys);
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
		this.revokeUserKeysAndCallback(res, revoked_filenames, owner, callback);
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
		let valid = sanitka.owner(owner);
		return (valid == null) ? false : true;
	}

	newUniqueIdentifier() {
		return new Date().getTime();
	}

	newNameWithOwner(i_owner, date) {
		const owner = sanitka.owner(i_owner);
		const filename = owner + "-" + date;
		return this.ssh_keys + "/" + filename;
	}

	generate(i_owner, date, callback) {
		const keyname = this.newNameWithOwner(i_owner, date);
		const private_path = keyname;
		const public_path = keyname + '.pub';

		// Generates RSA Key pair
		generateKeyPair('rsa', {
			modulusLength: 4096,
			publicKeyEncoding: {
				type: 'spki',
				format: 'pem'
			},
			privateKeyEncoding: {
				type: 'pkcs8',
				format: 'pem',
				cipher: 'aes-256-cbc',
				passphrase: '' // TODO: once we'll have Secure Storage (e.g. Vault), keys can be encrypted
			}
		}, (err, publicKey, privateKey) => {

			// to convert from RSA to OpenSSH if needed
			// const pubKey = forge.ssh.publicKeyToOpenSSH(forge.pki.publicKeyFromPem(publicKey));
			// const privKey = forge.ssh.privateKeyToOpenSSH(forge.pki.privateKeyFromPem(privateKey));

			fs.writeFileSync(public_path, publicKey);
			fs.chmodSync(fs.openSync(private_path), 0o400);
			fs.writeFileSync(private_path, privateKey);
			fs.chmodSync(fs.openSync(private_path), 0o400);
			callback(err, publicKey, privateKey);
		});
	}

	create(i_owner, callback) {

		const date = this.newUniqueIdentifier();
		const owner = sanitka.owner(i_owner);
		const filename = this.newNameWithOwner(i_owner, date) + '.pub';
		this.generate(owner, date, (err, pubKey /* , privKey */) => {
			if (err) {
				console.log(err);
				return callback(false);
			}
			callback(true, {
				name: date,
				pubkey: pubKey,
				filename: filename
			});
		});
	}
};
