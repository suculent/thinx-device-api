/*
 * Deterministic in-memory stand-in for lib/thinx/transit.js (Phase 40 Plan 02).
 *
 * Specs that make or read deploy keys inject it as `rsakey.transit` or
 * `git.transit`, so they need neither OpenBao nor GIT_KEY_PASSPHRASE. It does no
 * I/O. Failures are real TransitError instances from transit.js, so `reason`
 * checks and `instanceof` behave exactly as against the production client.
 *
 *   const FakeTransit = require("../fixtures/fake-transit.js");
 *   const t = new FakeTransit();                       // works
 *   const down = new FakeTransit({ failReason: "unreachable" });
 *   const decryptDown = new FakeTransit({ failReason: "sealed", failOps: ["decrypt"] });
 *
 * encryptKey resolves "vault:v<version>:<base64 of random bytes>", which never
 * contains the plaintext; decryptKey maps it back to an equal, fresh Buffer. A
 * string this instance never issued rejects bad_ciphertext, as OpenBao does.
 *
 * Versions (Phase 41, KEYMIG-03): `version` starts at 1 and rotate() raises it by
 * one, like transit/keys/<key>/rotate. rewrapKey(ct) re-issues a ciphertext this
 * instance issued under the current version and resolves {ciphertext, version},
 * like transit/rewrap; an unknown one rejects bad_ciphertext.
 */

const crypto = require("crypto");
const Transit = require("../../lib/thinx/transit.js");

const TransitError = Transit.TransitError;

// The HTTP status the real client attaches to each reason class.
const STATUS = { sealed: 503, denied: 403, bad_ciphertext: 400, server_error: 500 };

class FakeTransit {

	constructor(opts) {
		opts = opts || {};
		this.failReason = opts.failReason || null;
		this.failOps = new Set(opts.failOps || ["encrypt", "decrypt", "rewrap"]);
		this.calls = { encrypt: 0, decrypt: 0, rewrap: 0 };
		this.version = 1;
		this._store = new Map();
	}

	// The next key version, as an operator rotate would make it.
	rotate() {
		this.version += 1;
		return this.version;
	}

	_issue(buf) {
		let ciphertext;
		do {
			ciphertext = "vault:v" + this.version + ":" + crypto.randomBytes(24).toString("base64");
		} while (this._store.has(ciphertext));
		this._store.set(ciphertext, Buffer.from(buf)); // a copy: the caller zeroes its own
		return ciphertext;
	}

	// Switch failure on (reason) or off (null) at run time.
	fail(reason, ops) {
		this.failReason = reason || null;
		if (Array.isArray(ops)) this.failOps = new Set(ops);
	}

	_maybeFail(op) {
		if (this.failReason && this.failOps.has(op)) {
			throw new TransitError(this.failReason, STATUS[this.failReason] || null);
		}
	}

	async encryptKey(buf) {
		this.calls.encrypt += 1;
		this._maybeFail("encrypt");
		if (!Buffer.isBuffer(buf) || buf.length === 0) throw new TransitError("server_error");
		return this._issue(buf);
	}

	async decryptKey(ciphertext) {
		this.calls.decrypt += 1;
		this._maybeFail("decrypt");
		const ct = (typeof ciphertext === "string") ? ciphertext.trim() : "";
		if (!this._store.has(ct)) throw new TransitError("bad_ciphertext", 400);
		return Buffer.from(this._store.get(ct));
	}

	async rewrapKey(ciphertext) {
		this.calls.rewrap += 1;
		this._maybeFail("rewrap");
		const ct = (typeof ciphertext === "string") ? ciphertext.trim() : "";
		if (!this._store.has(ct)) throw new TransitError("bad_ciphertext", 400);
		return { ciphertext: this._issue(this._store.get(ct)), version: this.version };
	}
}

FakeTransit.TransitError = TransitError;

module.exports = FakeTransit;
