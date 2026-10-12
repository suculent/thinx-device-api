/** This THiNX Device Management API module is responsible for managing RSA Keys. */

const fs = require("fs-extra");
const sha256 = require("sha256");
const { generateKeyPair } = require('crypto');
const forge = require('node-forge');

let Globals = require("./globals");
const Util = require("./util");
const Sanitka = require("./sanitka"); var sanitka = new Sanitka();
const { readSecret } = require("./secrets.js");

// Key files are named <owner>-<timestamp>, owner being a sha256 hex digest.
const KEY_FILENAME = /^([0-9a-f]{64})-\d+(\.pub)?$/;

module.exports = class RSAKey {

	constructor() {
		this.ssh_keys = Globals.app_config().ssh_keys;

	}

	// Deploy keys are encrypted at rest and git.js hands the same passphrase to
	// ssh-add through SSH_ASKPASS, so the two must agree. This used to be the
	// literal 'thinx' baked into generate() while git.js read GIT_KEY_PASSPHRASE
	// -- with the env var unset the two disagreed, ssh-add failed (silenced by
	// >/dev/null in git.js) and the clone fell back to offering no identity.
	// Both now read it through readSecret (/run/secrets first, then env), so a
	// mounted secret changes both sides at once (SEC-CFG-02, D-04).
	static keyPassphrase() {
		const passphrase = readSecret("GIT_KEY_PASSPHRASE");
		if ((typeof (passphrase) !== "string") || (passphrase.length < 1)) return null;
		return passphrase;
	}

	// GitHub deploy keys, authorized_keys and ssh-add all want `ssh-rsa AAAA...`,
	// not the SPKI PEM that generateKeyPair emits -- pasting the PEM into GitHub
	// is rejected outright. Keys written before this conversion existed are still
	// PEM on disk, so read paths convert on the fly rather than rewriting them.
	static toOpenSSH(key_data, comment) {
		const text = key_data.toString('utf8').trim();
		if (text.indexOf("-----BEGIN") !== 0) return text; // already OpenSSH
		return forge.ssh.publicKeyToOpenSSH(forge.pki.publicKeyFromPem(text), comment);
	}

	getKeyPathsForOwner(owner) {
		var files = fs.readdirSync(this.ssh_keys);
		var result = files.filter(
			file => { const match = KEY_FILENAME.exec(file); return match && match[1] === owner && !file.endsWith(".pub"); }
		);
		if (typeof(result) === "undefined") result = 0;
		return result;
	}

	revokeUserKeys(revoked_filenames, owner) {
		var revoked_keys = [];
		var key_paths = this.getKeyPathsForOwner(owner);
		console.log("🔨 [debug] revokeUserKeys Revoked filenames: ", revoked_filenames);
		for (const filename of revoked_filenames) {
			if (!key_paths.includes(filename)) continue;
			const priv_path = this.ssh_keys + "/" + filename;
			const pub_path = priv_path + ".pub";
			if (fs.existsSync(priv_path)) fs.unlinkSync(priv_path);
			if (fs.existsSync(pub_path)) fs.unlinkSync(pub_path);
			revoked_keys.push(filename);
		}
		return revoked_keys;
	}

	exportKeysForList(key_paths, owner) {
		var exportedKeys = [];
		for (var kindex in key_paths) {
			const key_data = fs.readFileSync(this.ssh_keys + "/" + key_paths[kindex] + ".pub");
			const timestamp = key_paths[kindex].replace(owner + "-", "");
			var date = new Date(parseInt(timestamp, 10)).toString();
			// Keys created before the OpenSSH switch sit on disk as SPKI PEM.
			// Convert on read so the console always offers something GitHub
			// accepts, without having to rewrite or reissue the stored key.
			let pubkey;
			try {
				pubkey = RSAKey.toOpenSSH(key_data, "thinx-" + timestamp);
			} catch {
				pubkey = key_data.toString('utf8'); // unparseable; show as stored
			}
			// A public-key comment is persistent metadata; filenames remain
			// owner/timestamp-only so user-entered names never become paths.
			const comment = pubkey.trim().replace(/^\S+\s+\S+\s*/, "");
			var info = {
				name: comment && comment !== "thinx-" + timestamp ? comment : date,
				fingerprint: sha256(pubkey),
				date: date,
				pubkey: pubkey,
				filename: key_paths[kindex]
			};
			exportedKeys.push(info);
		}
		// Newest first by the millisecond timestamp in the filename: `date` is a
		// Date.toString() with whole seconds only, so keys created in the same
		// second (or 1 ms apart after a claim clash) kept directory order and an
		// older key could list first. git.js/github_link push the first key (38 WR-01).
		const createdAt = key => parseInt(key.filename.slice(key.filename.lastIndexOf("-") + 1), 10) || 0;
		return exportedKeys.sort((a, b) => createdAt(b) - createdAt(a));
	}

	keyPathsExist(owner) {
		var key_paths = this.getKeyPathsForOwner(owner);
		if (typeof(key_paths) === "undefined") return 0;
		return (key_paths.length > 0);
	}

	// GDPR #353: delete EVERY RSA key file (private + public) belonging to the
	// owner. Unlike revokeUserKeys (which indexes into a caller-supplied filename
	// list), this removes the full set returned by getKeyPathsForOwner.
	revokeAllForOwner(owner) {
		var revoked_keys = [];
		var key_paths;
		try {
			key_paths = this.getKeyPathsForOwner(owner);
		} catch (_e) {
			// ssh_keys dir missing / unreadable — nothing to revoke (idempotent)
			return revoked_keys;
		}
		for (var kindex in key_paths) {
			var priv_path = this.ssh_keys + "/" + key_paths[kindex];
			var pub_path = priv_path + ".pub";
			if (fs.existsSync(priv_path)) fs.unlinkSync(priv_path);
			if (fs.existsSync(pub_path)) fs.unlinkSync(pub_path);
			revoked_keys.push(key_paths[kindex]);
		}
		return revoked_keys;
	}

	// Every owner id that currently has key material on disk.
	listOwnersOnDisk() {
		let owners = new Set();
		let files;
		try {
			files = fs.readdirSync(this.ssh_keys);
		} catch {
			return []; // ssh_keys dir missing / unreadable
		}
		for (let file of files) {
			let match = KEY_FILENAME.exec(file);
			if (match !== null) owners.add(match[1]);
		}
		return Array.from(owners);
	}

	/**
	 * Delete key material belonging to owners that no longer exist in CouchDB.
	 *
	 * Accounts deleted before revokeAllForOwner existed (GDPR #353) left their
	 * private keys behind, so /mnt/data/ssh_keys accumulates keys for owners
	 * that cannot log in any more.
	 *
	 * @param {object} options - { dry_run } — dry_run defaults to true
	 * @param {function} callback(success, result)
	 */
	purgeOrphanedKeys(options, callback) {
		const dry_run = (Util.isDefined(options) && (options.dry_run === false)) ? false : true;

		const Database = require("./database.js");
		const db_uri = new Database().uri();
		const userlib = require("./couch")(db_uri).use(Globals.prefix() + "managed_users");

		userlib.view("users", "owners_by_id", { "include_docs": false }, (err, body) => {

			if (err) return callback(false, "users_view_failed");
			if (!Util.isDefined(body) || !Util.isDefined(body.rows)) return callback(false, "users_view_empty");

			// A CouchDB hiccup that returns zero rows would otherwise read as
			// "no user owns anything" and delete every private key on disk.
			if (body.rows.length < 1) return callback(false, "refusing_purge_no_users_found");

			const known_owners = new Set(body.rows.map((row) => row.id));
			// Count before purging: re-reading the directory afterwards reported
			// the owners left over, which read as nonsense next to the orphan
			// count ("owners on disk: 25, orphaned: 47").
			const owners_on_disk = this.listOwnersOnDisk();
			const orphans = owners_on_disk.filter((owner) => !known_owners.has(owner));

			let purged = [];
			for (let owner of orphans) {
				const files = dry_run ? this.getKeyPathsForOwner(owner) : this.revokeAllForOwner(owner);
				purged.push({ owner: owner, keys: files.length });
			}

			callback(true, {
				dry_run: dry_run,
				owners_in_db: known_owners.size,
				owners_on_disk: owners_on_disk.length,
				owners_retained: owners_on_disk.length - orphans.length,
				orphaned_owners: orphans.length,
				purged: purged
			});
		});
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

	// Picks the <owner>-<timestamp> name for a new key and claims it on disk
	// before the (slow, asynchronous) key generation starts. Two create() calls
	// for one owner in the same millisecond used to get the same name, and the
	// second writeFileSync silently replaced the key the first caller had already
	// been handed. The claim is an exclusive ('wx') create of the empty .pub;
	// on a clash the timestamp moves on by 1 ms, so the name stays a plain
	// <owner>-<digits> (KEY_FILENAME, the consoles' date parsing). list() only
	// shows names whose private file exists, so a claimed name stays invisible
	// until generate() has written the pair.
	reserveIdentifier(i_owner) {
		let date = this.newUniqueIdentifier();
		for (let attempt = 0; attempt < 1000; attempt++, date++) {
			const keyname = this.newNameWithOwner(i_owner, date);
			if (fs.existsSync(keyname)) continue;
			try {
				fs.closeSync(fs.openSync(keyname + ".pub", "wx", 0o644));
				return date;
			} catch (e) {
				if (e.code !== "EEXIST") throw e;
			}
		}
		return null;
	}

	releaseIdentifier(i_owner, date) {
		const keyname = this.newNameWithOwner(i_owner, date);
		if (fs.existsSync(keyname)) return; // a real pair; never touch it
		try { fs.unlinkSync(keyname + ".pub"); } catch { /* already gone */ }
	}

	generate(i_owner, date, callback, name) {
		const keyname = this.newNameWithOwner(i_owner, date);
		const private_path = keyname;
		const public_path = keyname + '.pub';

		const passphrase = RSAKey.keyPassphrase();
		if (passphrase === null) {
			// Generating here would hand out a key git.js cannot decrypt, and the
			// failure would only surface much later as "Permission denied (publickey)".
			console.log("ℹ️ [info] [rsakey] GIT_KEY_PASSPHRASE not set — deploy-key generation disabled");
			return callback(new Error("GIT_KEY_PASSPHRASE is not set; refusing to generate a deploy key"));
		}

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
				passphrase: passphrase
			}
		}, (err, publicKey, privateKey) => {
			if (err) return callback(err); // do not write undefined key material
			// Every filesystem step is inside try: this runs in an async callback, so
			// a throw here (disk full, EACCES) would take the whole API process down
			// and never release the claimed name (38 WR-02).
			let openssh_key;
			let privateStage = false;
			try {
				openssh_key = RSAKey.toOpenSSH(publicKey, name || "thinx-" + date) + "\n";
				// Public half first (into the .pub that create() claimed), private last:
				// list() shows a key only once its private file exists, so it never
				// sees a pair with an empty .pub.
				fs.writeFileSync(public_path, openssh_key);
				fs.chmodSync(public_path, 0o644);
				// 'wx': an existing private key under this name is never replaced.
				privateStage = true;
				fs.writeFileSync(private_path, privateKey, { flag: "wx", mode: 0o600 });
				fs.chmodSync(private_path, 0o600);
			} catch (e) {
				// Remove only a private file this call created ('wx' guarantees any file
				// there is ours unless the error is EEXIST), so a truncated key never
				// appears in list(); create() then releases the claimed .pub.
				if (privateStage && e.code !== "EEXIST") {
					try { fs.unlinkSync(private_path); } catch { /* not there */ }
				}
				return callback(e);
			}
			callback(null, openssh_key, privateKey);
		});
	}

	create(i_owner, callback, name) {
		if (typeof name !== "undefined" && (typeof name !== "string" || !name.trim() || name.trim().length > 120 || /[\r\n\x00-\x1f\x7f]/.test(name))) {
			return callback(false, "invalid_key_name");
		}
		const keyName = typeof name === "string" ? name.trim() : undefined;

		const owner = sanitka.owner(i_owner);
		let date;
		try {
			date = this.reserveIdentifier(i_owner);
		} catch (e) {
			console.log(e);
			return callback(false);
		}
		if (date === null) return callback(false);
		const filename = this.newNameWithOwner(i_owner, date) + '.pub';
		this.generate(owner, date, (err, pubKey /* , privKey */) => {
			if (err) {
				console.log(err);
				this.releaseIdentifier(i_owner, date);
				return callback(false);
			}
			callback(true, {
				name: keyName || date,
				date: new Date(date).toISOString(),
				pubkey: pubKey,
				filename: filename
			});
		}, keyName);
	}
};
