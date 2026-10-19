/*
 * OpenBao Transit client for deploy keys (Phase 40, KEYENC-04).
 *
 * Four HTTP calls, nothing else:
 *   POST /v1/auth/approle/login                      {role_id, secret_id}
 *   POST /v1/transit/encrypt/thinx-deploy-keys       {plaintext: base64}
 *   POST /v1/transit/decrypt/thinx-deploy-keys       {ciphertext}
 * No auth/token endpoint is ever called: renew-self, lookup-self and
 * revoke-self are 403 for the thinx-api role, so the client logs in again
 * instead. No associated_data / context field is sent: AAD breaks rewrap on
 * OpenBao 2.7.1, and Phase 41 needs rewrap.
 *
 * Transport: Node's https module only (no new dependency). BAO_ADDR must be
 * https:, the CA read from BAO_CACERT is the only trust anchor, certificate
 * and hostname verification stay on, and every request is bounded by
 * AbortSignal.timeout.
 *
 * Output discipline: the only log line is
 *   "[transit] <op> failed: <reason> status=<n>"
 * and every failure is a TransitError whose message is "transit_" + reason.
 * Never log or attach an error message, a header, a body, a token, a
 * role_id/secret_id, ciphertext or plaintext.
 */

const https = require("https");
const fs = require("fs");
const net = require("net");
const os = require("os");
const secrets = require("./secrets.js");

const KEY = "thinx-deploy-keys";
const MAX_BODY = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_REFRESH_MARGIN_MS = 120000;

const REASONS = Object.freeze([
	"not_configured",
	"unreachable",
	"tls",
	"sealed",
	"denied",
	"bad_ciphertext",
	"server_error"
]);

const UNREACHABLE_CODES = new Set([
	"ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "ABORT_ERR",
	"EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ECONNABORTED"
]);

// Certificate / hostname verification failures (OpenSSL verify codes and
// Node's ERR_TLS_* / ERR_SSL_* codes).
const TLS_CODE = /^(ERR_TLS_|ERR_SSL_|CERT_)|UNABLE_TO_|SELF_SIGNED|DEPTH_ZERO|INVALID_CA|HOSTNAME_MISMATCH|INVALID_PURPOSE|PATH_LENGTH_EXCEEDED/;

const SENTENCES = Object.freeze({
	unreachable: "key service unreachable",
	sealed: "key service sealed",
	denied: "key service refused the request",
	tls: "key service certificate not trusted",
	not_configured: "key service not configured",
	bad_ciphertext: "stored key could not be decrypted"
});

class TransitError extends Error {
	constructor(reason, status) {
		super("transit_" + reason);
		this.name = "TransitError";
		this.reason = reason;
		this.status = (typeof status === "number" && Number.isFinite(status)) ? status : null;
	}
}

function transportReason(code) {
	const c = String(code || "");
	if (TLS_CODE.test(c)) return "tls";
	// Anything else that failed below HTTP (refused, DNS, reset, timeout) is
	// "unreachable": the request never produced an answer we could classify.
	if (UNREACHABLE_CODES.has(c)) return "unreachable";
	return "unreachable";
}

class Transit {

	constructor(opts) {
		opts = opts || {};
		this._opts = opts;
		this.addr = ("addr" in opts) ? opts.addr : process.env.BAO_ADDR;
		this.caFile = ("caFile" in opts) ? opts.caFile : process.env.BAO_CACERT;
		this.readSecret = (typeof opts.readSecret === "function") ? opts.readSecret : secrets.readSecret;
		this.now = (typeof opts.now === "function") ? opts.now : () => Date.now();
		this.requestTimeoutMs = (typeof opts.requestTimeoutMs === "number") ? opts.requestTimeoutMs : DEFAULT_TIMEOUT_MS;
		this.refreshMarginMs = (typeof opts.refreshMarginMs === "number") ? opts.refreshMarginMs : DEFAULT_REFRESH_MARGIN_MS;
		this.hostname = ("hostname" in opts) ? opts.hostname : os.hostname();
		this.log = (typeof opts.log === "function") ? opts.log : (line) => console.log(line);
		this._cfg = null;    // {hostname, port, ca}, built once per instance
		this._token = null;  // {value, expiresAt}, memory only
	}

	static get TransitError() { return TransitError; }
	static get REASONS() { return REASONS; }

	static unavailableSentence(reason) {
		return Object.prototype.hasOwnProperty.call(SENTENCES, reason) ? SENTENCES[reason] : "key service error";
	}

	static shared() {
		if (!Transit._shared) Transit._shared = new Transit();
		return Transit._shared;
	}

	// --- configuration -----------------------------------------------------

	// Validates BAO_ADDR and reads the CA. Runs before any credential is read,
	// so an http: address never even looks at role_id/secret_id.
	_config() {
		if (this._cfg) return this._cfg;
		let url;
		try {
			url = new URL(String(this.addr || ""));
		} catch (_e) {
			throw new TransitError("not_configured");
		}
		if (url.protocol !== "https:" || !url.hostname) throw new TransitError("not_configured");
		let ca;
		try {
			ca = fs.readFileSync(String(this.caFile || ""));
		} catch (_e) {
			throw new TransitError("not_configured");
		}
		if (!ca || ca.length === 0) throw new TransitError("not_configured");
		const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");
		this._cfg = { hostname, port: Number(url.port || 8200), ca };
		return this._cfg;
	}

	// --- transport ---------------------------------------------------------

	// Resolves {status, json} | {status, tooBig} | {code}. Never rejects and
	// never exposes the body or the error message to the caller's log.
	_request(path, body, token) {
		const cfg = this._config();
		return new Promise((resolve) => {
			let settled = false;
			const done = (v) => { if (!settled) { settled = true; resolve(v); } };
			const data = JSON.stringify(body || {});
			const headers = {
				"content-type": "application/json",
				"content-length": Buffer.byteLength(data)
			};
			if (token) headers["x-vault-token"] = token;
			const options = {
				hostname: cfg.hostname,
				port: cfg.port,
				path: "/v1/" + path,
				method: "POST",
				ca: cfg.ca,                 // the only trust anchor: no system store
				rejectUnauthorized: true,
				agent: false,               // no pooled sockets shared with other code
				signal: AbortSignal.timeout(this.requestTimeoutMs),
				headers
			};
			// SNI may not carry an IP literal (RFC 6066); hostname verification
			// still checks the IP SAN through the connect host.
			if (!net.isIP(cfg.hostname)) options.servername = cfg.hostname;
			let req;
			try {
				req = https.request(options, (res) => {
					const chunks = [];
					let size = 0;
					res.on("data", (c) => {
						if (settled) return;
						size += c.length;
						if (size > MAX_BODY) {
							done({ status: res.statusCode, tooBig: true });
							req.destroy();
							return;
						}
						chunks.push(c);
					});
					res.on("end", () => {
						let json = null;
						try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (_e) { json = null; }
						done({ status: res.statusCode, json });
					});
					res.on("error", (e) => done({ code: String((e && e.code) || "ECONNRESET") }));
					res.on("aborted", () => done({ code: "ECONNRESET" }));
				});
			} catch (e) {
				return done({ code: String((e && e.code) || "ERROR") });
			}
			req.on("error", (e) => done({ code: String((e && e.code) || "ERROR") }));
			req.end(data);
		});
	}

	// Maps a non-success outcome to a TransitError.
	_classify(op, r) {
		if (r.code) return new TransitError(transportReason(r.code), null);
		const s = r.status;
		if (r.tooBig) return new TransitError("server_error", s);
		if (s === 503) return new TransitError("sealed", s);
		if (s === 403) return new TransitError("denied", s);
		if (s === 400 && (op === "login" || op === "probe")) return new TransitError("denied", s);
		if (s === 400 && op === "decrypt") return new TransitError("bad_ciphertext", s);
		return new TransitError("server_error", s);
	}

	_logFailure(op, e) {
		this.log("[transit] " + op + " failed: " + e.reason + " status=" + (e.status || 0));
	}

	// --- token -------------------------------------------------------------

	_tokenValid() {
		return !!(this._token && this.now() < this._token.expiresAt - this.refreshMarginMs);
	}

	async _login(label) {
		const op = label || "login";
		try {
			this._config();
			const roleId = this.readSecret("BAO_ROLE_ID");
			const secretId = this.readSecret("BAO_SECRET_ID");
			if (typeof roleId !== "string" || roleId.length === 0 || typeof secretId !== "string" || secretId.length === 0) {
				throw new TransitError("not_configured");
			}
			const r = await this._request("auth/approle/login", { role_id: roleId, secret_id: secretId }, null);
			if (r.code || r.tooBig || r.status < 200 || r.status > 299) throw this._classify(op, r);
			const auth = r.json && r.json.auth;
			const value = auth && auth.client_token;
			const lease = auth && Number(auth.lease_duration);
			if (typeof value !== "string" || value.length === 0 || !Number.isFinite(lease) || lease <= 0) {
				throw new TransitError("server_error", r.status);
			}
			this._token = { value, expiresAt: this.now() + lease * 1000 };
			return value;
		} catch (e) {
			const err = (e instanceof TransitError) ? e : new TransitError("server_error");
			this._logFailure(op, err);
			throw err;
		}
	}

	async _ensureToken() {
		if (this._tokenValid()) return this._token.value;
		this._token = null;
		return this._login("login");
	}

	// --- operations --------------------------------------------------------

	async _encryptOnce(token, plaintextB64) {
		const r = await this._request("transit/encrypt/" + KEY, { plaintext: plaintextB64 }, token);
		if (r.code || r.tooBig || r.status < 200 || r.status > 299) throw this._classify("encrypt", r);
		const ct = r.json && r.json.data && r.json.data.ciphertext;
		if (typeof ct !== "string" || !/^vault:v[1-9][0-9]*:/.test(ct)) throw new TransitError("server_error", r.status);
		return ct;
	}

	async _decryptOnce(token, ciphertext) {
		const r = await this._request("transit/decrypt/" + KEY, { ciphertext }, token);
		if (r.code || r.tooBig || r.status < 200 || r.status > 299) throw this._classify("decrypt", r);
		const pt = r.json && r.json.data && r.json.data.plaintext;
		if (typeof pt !== "string") throw new TransitError("server_error", r.status);
		return Buffer.from(pt, "base64");
	}

	async encryptKey(buf) {
		try {
			if (!Buffer.isBuffer(buf) || buf.length === 0) throw new TransitError("server_error");
			const token = await this._ensureToken();
			return await this._encryptOnce(token, buf.toString("base64"));
		} catch (e) {
			const err = (e instanceof TransitError) ? e : new TransitError("server_error");
			this._logFailure("encrypt", err);
			throw err;
		}
	}

	// Resolves a Buffer; the caller zeroes it with fill(0) after use.
	async decryptKey(ciphertext) {
		try {
			const ct = (typeof ciphertext === "string") ? ciphertext.trim() : "";
			if (!/^vault:v[1-9][0-9]*:/.test(ct)) throw new TransitError("bad_ciphertext");
			const token = await this._ensureToken();
			return await this._decryptOnce(token, ct);
		} catch (e) {
			const err = (e instanceof TransitError) ? e : new TransitError("server_error");
			this._logFailure("decrypt", err);
			throw err;
		}
	}
}

Transit._shared = null;

module.exports = Transit;
