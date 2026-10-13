/** This THiNX Device Management API module is responsible for managing RSA Keys. */

const fs = require("fs-extra");
const crypto = require("crypto");
const { generateKeyPair } = crypto;
const forge = require('node-forge');

let Globals = require("./globals");
const Util = require("./util");
const Sanitka = require("./sanitka"); var sanitka = new Sanitka();
const { readSecret } = require("./secrets.js");

// Key files are named <owner>-<timestamp>, owner being a sha256 hex digest.
const KEY_FILENAME = /^([0-9a-f]{64})-\d+(\.pub)?$/;
// A rename writes `.<owner>-<timestamp>.pub.<hex>.tmp` next to the .pub, then renames it
// over the .pub. The leading dot keeps it outside KEY_FILENAME, so list(), the claim sweep
// and the orphan purge never see it; revokeAllForOwner removes a leftover one.
const RENAME_TEMP = /^\.([0-9a-f]{64})-\d+\.pub\.[0-9a-f]+\.tmp$/;
// Strict base64 (the key blob of an OpenSSH public-key line).
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const KEY_NAME_MAX = 120; // UTF-16 code units, what the HTML maxlength attribute counts

// D-06: the reason a single UTF-16 code unit makes a key name unsafe, or null.
// Compared as numbers on purpose: a regular expression with a control-character class
// trips Codacy no-control-regex (quick 261012-r9z).
function keyNameUnitProblem(c) {
	if (c < 0x20 || c === 0x7F || (c >= 0x80 && c <= 0x9F)) return "control_chars"; // C0, DEL, C1
	if (c === 0x2028 || c === 0x2029) return "line_separator"; // line / paragraph separator
	if ((c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x200E || c === 0x200F || c === 0x061C) {
		return "bidi"; // embeddings, overrides, isolates, LRM/RLM/ALM (45-REVIEW IN-01)
	}
	// ZWNJ U+200C and ZWJ U+200D stay allowed: emoji ZWJ sequences and Persian/Indic names
	// need them (D-06); a name made only of them is still empty (hasVisibleCharacter).
	if (c === 0x200B || c === 0x2060 || c === 0xFEFF) {
		return "invisible"; // ZWSP, word joiner, BOM (45-REVIEW IN-01)
	}
	return null;
}

// Unicode Default_Ignorable_Code_Point: characters that render as nothing (IN-01).
function isDefaultIgnorable(cp) {
	return cp === 0x00AD || cp === 0x034F || cp === 0x061C || cp === 0x115F || cp === 0x1160 ||
		cp === 0x17B4 || cp === 0x17B5 || (cp >= 0x180B && cp <= 0x180F) || (cp >= 0x200B && cp <= 0x200F) ||
		(cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2060 && cp <= 0x206F) || cp === 0x3164 ||
		(cp >= 0xFE00 && cp <= 0xFE0F) || cp === 0xFEFF || cp === 0xFFA0 || (cp >= 0xFFF0 && cp <= 0xFFF8) ||
		(cp >= 0x1BCA0 && cp <= 0x1BCA3) || (cp >= 0x1D173 && cp <= 0x1D17A) || (cp >= 0xE0000 && cp <= 0xE0FFF);
}

// True when the text shows at least one character that is neither whitespace nor
// default-ignorable, so a name of soft hyphens or variation selectors counts as empty.
function hasVisibleCharacter(text) {
	for (const character of text) {
		if (!isDefaultIgnorable(character.codePointAt(0)) && character.trim().length > 0) return true;
	}
	return false;
}

// No LF or CR anywhere (compared as numbers, like keyNameUnitProblem).
function isSingleLine(text) {
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c === 0x0A || c === 0x0D) return false;
	}
	return true;
}

// The decoded key blob of an OpenSSH line `type base64 [comment]`, or null. The blob must
// start with the length-prefixed `type` and consist of whole length-prefixed fields
// (RSA: type, e, n), so a truncated or foreign blob is never fingerprinted.
function openSSHBlob(text) {
	if (!isSingleLine(text)) return null;
	const parts = text.split(/\s+/);
	if (parts.length < 2 || parts[1].length % 4 !== 0 || !BASE64.test(parts[1])) return null;
	const blob = Buffer.from(parts[1], "base64");
	let offset = 0;
	let fields = 0;
	while (offset < blob.length) {
		if (offset + 4 > blob.length) return null;
		const length = blob.readUInt32BE(offset);
		if (offset + 4 + length > blob.length) return null;
		if (fields === 0 && blob.toString("latin1", 4, 4 + length) !== parts[0]) return null;
		offset += 4 + length;
		fields++;
	}
	return fields >= 2 ? blob : null;
}

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

	/**
	 * OpenSSH fingerprint (Phase 45 D-01): `SHA256:` plus unpadded base64 of SHA-256 over
	 * the decoded key blob, exactly what `ssh-keygen -l` and GitHub show. The comment is not
	 * part of it, so a rename keeps it. A PEM key is fingerprinted through its OpenSSH form
	 * (exportKeysForList converts first); anything unparseable gives null.
	 */
	static fingerprint(pubkey) {
		if (typeof pubkey !== "string") return null;
		const blob = openSSHBlob(pubkey.trim());
		if (blob === null) return null;
		return "SHA256:" + crypto.createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
	}

	/**
	 * Display name rule (Phase 45 D-08; closes 38-REVIEW IN-03, where a damaged PEM listed
	 * as "KEY-----..." and any comment was shown verbatim). The stored comment is the name
	 * only on a single-line `ssh-` key, and only when it is not the generated
	 * `thinx-<timestamp>` and passes validateKeyName. Otherwise null: list() shows the date.
	 */
	static storedName(pubkey, timestamp) {
		const text = pubkey.trim();
		if (text.indexOf("ssh-") !== 0 || !isSingleLine(text)) return null;
		if (text.split(/\s+/).length < 3) return null; // no comment
		const comment = text.replace(/^\S+\s+\S+\s*/, "");
		if (comment === "thinx-" + timestamp) return null;
		return RSAKey.validateKeyName(comment).ok ? comment : null;
	}

	/**
	 * True when `name`, trimmed, is the generated default comment `thinx-<timestamp>` of the
	 * key with that timestamp. storedName() hides exactly that comment, so rename() and
	 * create() refuse it with the reason `reserved` (45-REVIEW IN-02). Another key's
	 * `thinx-<n>` is an ordinary name.
	 */
	static isReservedName(name, timestamp) {
		return typeof name === "string" && name.trim() === "thinx-" + timestamp;
	}

	/**
	 * The one key-name check (Phase 45 D-05/D-06; closes 38-REVIEW IN-01, the duplicated
	 * create/router predicate, and IN-02, which let bidi controls, U+2028/U+2029 and C1
	 * controls through). Used by create(), rename() and both routers.
	 *
	 * Every code unit of the untrimmed string is scanned first, the first offending one
	 * decides: String.prototype.trim silently drops a trailing line break and U+2028/U+2029.
	 * A lone surrogate is a control_chars refusal (UTF-8 would store it as U+FFFD, not as
	 * sent), and a name with no visible character is empty (45-REVIEW IN-01). Letters, emoji
	 * and punctuation of any script are allowed, including ZWNJ/ZWJ inside them (D-06).
	 * Callers store the trimmed name. utils/keyNames.js in the Vue console is the identical
	 * client mirror; spec/node/DeployKeyNames.test.js compares the two on every code unit.
	 *
	 * @returns {{ok: true} | {ok: false, reason: string}} reason is one of
	 *   empty, too_long, control_chars, line_separator, bidi, invisible
	 */
	static validateKeyName(name) {
		if (typeof name !== "string") return { ok: false, reason: "empty" };
		for (let i = 0; i < name.length; i++) {
			const c = name.charCodeAt(i);
			if (c >= 0xD800 && c <= 0xDBFF) {
				const next = i + 1 < name.length ? name.charCodeAt(i + 1) : 0;
				if (next >= 0xDC00 && next <= 0xDFFF) { i++; continue; } // a surrogate pair
				return { ok: false, reason: "control_chars" };
			}
			if (c >= 0xDC00 && c <= 0xDFFF) return { ok: false, reason: "control_chars" };
			const reason = keyNameUnitProblem(c);
			if (reason !== null) return { ok: false, reason: reason };
		}
		const trimmed = name.trim();
		if (trimmed.length === 0 || !hasVisibleCharacter(trimmed)) return { ok: false, reason: "empty" };
		if (trimmed.length > KEY_NAME_MAX) return { ok: false, reason: "too_long" };
		return { ok: true };
	}

	// The single OpenSSH line `type base64 name` for a stored public key, or null when the
	// stored text is neither an SPKI PEM nor a single-line `ssh-` key with a base64 blob
	// (D-03: a PEM .pub is converted on rename; the key material never changes).
	static renamedPublicKey(stored, name) {
		const text = stored.trim();
		try {
			if (text.indexOf("-----BEGIN") === 0) {
				const line = RSAKey.toOpenSSH(text, name).trim();
				return isSingleLine(line) ? line : null;
			}
		} catch {
			return null; // damaged PEM
		}
		if (!isSingleLine(text)) return null;
		const parts = text.split(/\s+/);
		if (parts.length < 2 || parts[0].indexOf("ssh-") !== 0) return null;
		if (parts[1].length % 4 !== 0 || !BASE64.test(parts[1])) return null;
		return parts[0] + " " + parts[1] + " " + name;
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
		if (!Array.isArray(revoked_filenames)) return revoked_keys; // 38 WR-05: never iterate a non-array
		var key_paths = this.getKeyPathsForOwner(owner);
		// Phase 45 D-14 (38 IN-04): a filename named twice is handled and reported once.
		for (const filename of new Set(revoked_filenames)) {
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
			let key_data;
			try {
				key_data = fs.readFileSync(this.ssh_keys + "/" + key_paths[kindex] + ".pub");
			} catch {
				continue; // no public half
			}
			if (key_data.length === 0) continue; // being written right now (generate writes private first)
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
			// Only a safe comment is shown (D-08); the fingerprint covers the key
			// blob only, so it matches ssh-keygen and GitHub and survives a rename (D-01).
			var info = {
				name: RSAKey.storedName(pubkey, timestamp) || date,
				fingerprint: RSAKey.fingerprint(pubkey),
				date: date,
				pubkey: pubkey,
				filename: key_paths[kindex]
			};
			exportedKeys.push(info);
		}
		// Newest first by the millisecond timestamp in the filename: `date` is a
		// Date.toString() with whole seconds only, so keys created in the same
		// second (or 1 ms apart after a claim clash) kept directory order and an
		// older key could list first (38 WR-01). This order serves the consoles only:
		// github_link picks the oldest fingerprinted key by timestamp itself (Phase 45
		// D-13, 45-REVIEW WR-01), and git.js never reads list() (it uses
		// getKeyPathsForOwner plus the last good key in Redis).
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
		// A .pub with no private half (a name claim stranded by a restart during
		// keygen) is not in key_paths but still belongs to the owner (38 WR-04).
		// So does a rename temp file left by a crash between write and rename (Phase 45).
		for (const file of fs.readdirSync(this.ssh_keys)) {
			const match = KEY_FILENAME.exec(file) || RENAME_TEMP.exec(file);
			if (match && match[1] === owner) fs.unlinkSync(this.ssh_keys + "/" + file);
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
		this.sweepStaleClaims(owner);
		var key_paths = this.getKeyPathsForOwner(owner);
		callback(true, this.exportKeysForList(key_paths, owner));
	}

	/**
	 * Rename a deploy key: rewrite the comment of <filename>.pub, nothing else (Phase 45
	 * KEY-04, D-02..D-04). The filename never changes, so git.js and every repository that
	 * uses the key keep working, and the key material, hence the fingerprint, stays the same.
	 *
	 * Rename never opens, reads, writes, chmods or removes the private half: vault-transit
	 * Phase 40 rewrites private-key storage in this file, and a rename must neither depend
	 * on nor disturb how that half is stored. Only the .pub and its own temp file are touched.
	 *
	 * The key is addressed by exact membership of `filename` in getKeyPathsForOwner(owner);
	 * a foreign, unknown or malformed filename gets the same `key_not_found` (no oracle).
	 *
	 * @param {function} callback(success, response, reason) - response is the list() entry
	 *   on success, else invalid_key_name (with a validateKeyName reason, or `reserved` for
	 *   the key's own default comment), key_not_found or rename_failed
	 */
	rename(owner, filename, name, callback) {
		const check = RSAKey.validateKeyName(name);
		if (!check.ok) return callback(false, "invalid_key_name", check.reason);
		let key_paths;
		try {
			key_paths = this.getKeyPathsForOwner(owner);
		} catch {
			return callback(false, "key_not_found"); // key directory missing / unreadable
		}
		if (typeof filename !== "string" || !key_paths.includes(filename)) return callback(false, "key_not_found");
		// list() shows the date for the generated default comment, so this name could never
		// be displayed: refuse it rather than report a rename nobody sees (45-REVIEW IN-02).
		if (RSAKey.isReservedName(name, filename.slice(filename.lastIndexOf("-") + 1))) {
			return callback(false, "invalid_key_name", "reserved");
		}
		const pub_path = this.ssh_keys + "/" + filename + ".pub";
		let stored;
		try {
			stored = fs.readFileSync(pub_path, "utf8");
		} catch {
			return callback(false, "key_not_found"); // no public half
		}
		if (stored.trim().length === 0) return callback(false, "key_not_found"); // still being generated
		const line = RSAKey.renamedPublicKey(stored, name.trim());
		if (line === null) return callback(false, "rename_failed");
		// Revoked meanwhile (45-REVIEW IN-04): rename() is synchronous, so only another API
		// process on the shared key volume can revoke the pair mid-rename. The key is checked
		// again right before the final renameSync, and after it: a revoke that landed between
		// the two would leave the .pub written here as a non-empty orphan, so it is removed.
		const listed = () => this.keyStillListed(owner, filename, pub_path);
		const replaced = this.replacePublicKey(pub_path, filename, line + "\n", listed);
		if (replaced === "gone") return callback(false, "key_not_found");
		if (replaced !== true) return callback(false, "rename_failed");
		if (!listed()) {
			try { fs.unlinkSync(pub_path); } catch { /* the revoke removed it */ }
			return callback(false, "key_not_found");
		}
		const entry = this.exportKeysForList([filename], owner)[0];
		if (typeof entry === "undefined") return callback(false, "key_not_found");
		callback(true, entry);
	}

	// True while `filename` is still one of the owner's listed keys (a directory listing,
	// never an open of the private half, D-04) and its .pub exists.
	keyStillListed(owner, filename, pub_path) {
		try {
			return this.getKeyPathsForOwner(owner).includes(filename) && fs.existsSync(pub_path);
		} catch {
			return false; // key directory gone or unreadable
		}
	}

	// Atomic .pub replace (D-04): a dot-prefixed temp file in the same directory, created
	// exclusively with the .pub's mode, then renamed over the .pub. On any failure the temp
	// file is removed and the old .pub is left as it was. `stillListed()` runs right before
	// the rename; when it answers false the temp file is removed and "gone" is returned.
	// Returns true, false (failed) or "gone".
	replacePublicKey(pub_path, filename, text, stillListed) {
		const tmp_path = this.ssh_keys + "/." + filename + ".pub." + crypto.randomBytes(6).toString("hex") + ".tmp";
		try {
			const mode = fs.statSync(pub_path).mode & 0o777;
			fs.writeFileSync(tmp_path, text, { flag: "wx", mode: mode });
			fs.chmodSync(tmp_path, mode); // the umask may have narrowed the create mode
			if (typeof stillListed === "function" && !stillListed()) {
				fs.unlinkSync(tmp_path);
				return "gone";
			}
			fs.renameSync(tmp_path, pub_path);
			return true;
		} catch (e) {
			// EEXIST: the exclusive create hit a file that is not ours; leave it alone.
			if (!e || e.code !== "EEXIST") {
				try { fs.unlinkSync(tmp_path); } catch { /* never created */ }
			}
			return false;
		}
	}

	// An empty <owner>-<ts>.pub with no private half is a name claim; one older
	// than max_age_ms was stranded by a restart during keygen and is removed
	// (38 WR-04). A claim in progress is seconds old and is left alone.
	sweepStaleClaims(owner, max_age_ms = 10 * 60 * 1000) {
		let files;
		try { files = fs.readdirSync(this.ssh_keys); } catch { return 0; }
		let swept = 0;
		for (const file of files) {
			const match = KEY_FILENAME.exec(file);
			if (!match || match[1] !== owner || !file.endsWith(".pub")) continue;
			const pub_path = this.ssh_keys + "/" + file;
			if (fs.existsSync(pub_path.slice(0, -4))) continue; // has a private half
			try {
				const stat = fs.statSync(pub_path);
				if (stat.size === 0 && Date.now() - stat.mtimeMs > max_age_ms) { fs.unlinkSync(pub_path); swept++; }
			} catch { /* raced with another sweep or delete */ }
		}
		return swept;
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
			// Private half first, with 'wx': an existing private key under this name
			// is never replaced and its .pub is never touched. Then the public half
			// into the .pub that create() claimed. list() skips a pair whose .pub is
			// still empty, so it never shows a half-written key (38 WR-03).
			let openssh_key;
			let privateStage = false;
			try {
				openssh_key = RSAKey.toOpenSSH(publicKey, name || "thinx-" + date) + "\n";
				privateStage = true;
				fs.writeFileSync(private_path, privateKey, { flag: "wx", mode: 0o600 });
				fs.chmodSync(private_path, 0o600);
				fs.writeFileSync(public_path, openssh_key);
				fs.chmodSync(public_path, 0o644);
			} catch (e) {
				// From the private write on, any file at private_path is ours ('wx'),
				// unless that open failed with EEXIST. Remove it, including one left
				// truncated by ENOSPC/EIO, so no broken key is ever listed; create()
				// then releases the claimed .pub.
				if (privateStage && e.code !== "EEXIST") {
					try { fs.unlinkSync(private_path); } catch { /* not there */ }
				}
				return callback(e);
			}
			callback(null, openssh_key, privateKey);
		});
	}

	create(i_owner, callback, name) {
		// The shared check (D-05, IN-01); callback(false, "invalid_key_name", reason).
		let keyName;
		if (typeof name !== "undefined") {
			const check = RSAKey.validateKeyName(name);
			if (!check.ok) return callback(false, "invalid_key_name", check.reason);
			keyName = name.trim();
		}

		const owner = sanitka.owner(i_owner);
		let date;
		try {
			date = this.reserveIdentifier(i_owner);
		} catch (e) {
			console.log(e);
			return callback(false);
		}
		if (date === null) return callback(false);
		// The timestamp is only known now; a name equal to this key's own default comment
		// would never be listed (45-REVIEW IN-02).
		if (RSAKey.isReservedName(keyName, date)) {
			this.releaseIdentifier(i_owner, date);
			return callback(false, "invalid_key_name", "reserved");
		}
		this.generate(owner, date, (err, pubKey /* , privKey */) => {
			if (err) {
				console.log(err);
				this.releaseIdentifier(i_owner, date);
				return callback(false);
			}
			// Same shape as list(): the bare <owner>-<timestamp> filename (what
			// revoke takes; never the server path), date as Date.toString(), and the
			// display name falling back to that date. `created` is the exact ms (38 WR-06).
			const date_string = new Date(date).toString();
			callback(true, {
				name: keyName || date_string,
				date: date_string,
				created: date,
				pubkey: pubKey,
				filename: owner + "-" + date
			});
		}, keyName);
	}
};
