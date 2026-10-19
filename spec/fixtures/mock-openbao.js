/* Scriptable in-process https mock of the three OpenBao calls lib/thinx/transit.js
 * makes (Phase 40, KEYENC-05):
 *
 *   POST /v1/auth/approle/login
 *   POST /v1/transit/encrypt/thinx-deploy-keys
 *   POST /v1/transit/decrypt/thinx-deploy-keys
 *
 * The CA and the 127.0.0.1/localhost leaf are minted with node-forge at start
 * (keys from Node's native RSA generator), so no key material is committed. A
 * second, unrelated CA (otherCaFile) drives the tls case.
 *
 * requests records method, path, op and whether a token header was present,
 * never a header or body value. script(fn) overrides the answer per request:
 * fn({op, index, opIndex}) returns undefined for the default handler or
 * {status, body, delay, hang, oversize, raw}.
 */

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const forge = require("node-forge");

function forgeKeys() {
	const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
	const pem = privateKey.export({ type: "pkcs1", format: "pem" });
	const priv = forge.pki.privateKeyFromPem(pem);
	const pub = forge.pki.setRsaPublicKey(priv.n, priv.e);
	return { priv, pub, pem };
}

function baseCert(pub, subject, issuer) {
	const cert = forge.pki.createCertificate();
	cert.publicKey = pub;
	cert.serialNumber = "01" + crypto.randomBytes(8).toString("hex");
	cert.validity.notBefore = new Date(Date.now() - 60 * 1000);
	cert.validity.notAfter = new Date(Date.now() + 24 * 3600 * 1000);
	cert.setSubject(subject);
	cert.setIssuer(issuer);
	return cert;
}

function mintCa(cn) {
	const k = forgeKeys();
	const attrs = [{ name: "commonName", value: cn }];
	const cert = baseCert(k.pub, attrs, attrs);
	cert.setExtensions([
		{ name: "basicConstraints", cA: true, critical: true },
		{ name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
		{ name: "subjectKeyIdentifier" }
	]);
	cert.sign(k.priv, forge.md.sha256.create());
	return { cert, key: k.priv, attrs, certPem: forge.pki.certificateToPem(cert) };
}

function mintLeaf(ca) {
	const k = forgeKeys();
	const cert = baseCert(k.pub, [{ name: "commonName", value: "localhost" }], ca.attrs);
	cert.setExtensions([
		{ name: "basicConstraints", cA: false },
		{ name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
		{ name: "extKeyUsage", serverAuth: true },
		{ name: "subjectAltName", altNames: [{ type: 7, ip: "127.0.0.1" }, { type: 2, value: "localhost" }] },
		{ name: "authorityKeyIdentifier", keyIdentifier: ca.cert.generateSubjectKeyIdentifier().getBytes() }
	]);
	cert.sign(ca.key, forge.md.sha256.create());
	return { certPem: forge.pki.certificateToPem(cert), keyPem: k.pem };
}

const OPS = {
	"/v1/auth/approle/login": "login",
	"/v1/transit/encrypt/thinx-deploy-keys": "encrypt",
	"/v1/transit/decrypt/thinx-deploy-keys": "decrypt"
};

/**
 * @param {object} [opts]
 * @param {string} [opts.token]          client_token the login answers with
 * @param {number} [opts.leaseDuration]  lease_duration in seconds (default 1200)
 * @param {string} [opts.ciphertext]     fixed ciphertext encrypt answers with
 * @param {string} [opts.roleId]         when set, login answers 400 on mismatch
 * @param {string} [opts.secretId]       when set, login answers 400 on mismatch
 * @returns {Promise<{addr, caFile, otherCaFile, requests, connections, script, close}>}
 */
async function start(opts) {
	opts = opts || {};
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-mock-openbao-"));
	const ca = mintCa("thinx mock openbao ca");
	const other = mintCa("unrelated ca");
	const leaf = mintLeaf(ca);
	const caFile = path.join(dir, "ca.pem");
	const otherCaFile = path.join(dir, "other-ca.pem");
	fs.writeFileSync(caFile, ca.certPem, { mode: 0o600 });
	fs.writeFileSync(otherCaFile, other.certPem, { mode: 0o600 });

	const token = opts.token || ("mock-token-" + crypto.randomBytes(6).toString("hex"));
	const lease = typeof opts.leaseDuration === "number" ? opts.leaseDuration : 1200;
	const store = new Map();
	const requests = [];
	const counters = { login: 0, encrypt: 0, decrypt: 0, other: 0 };
	const sockets = new Set();
	const state = { connections: 0, scriptFn: null };

	function send(res, status, body) {
		const text = typeof body === "string" ? body : JSON.stringify(body || {});
		res.writeHead(status, { "content-type": "application/json" });
		res.end(text);
	}

	function defaultAnswer(op, req, json) {
		if (op === "login") {
			const ok = json && typeof json.role_id === "string" && typeof json.secret_id === "string" &&
				(!opts.roleId || json.role_id === opts.roleId) && (!opts.secretId || json.secret_id === opts.secretId);
			if (!ok) return { status: 400, body: { errors: ["invalid role or secret ID"] } };
			return { status: 200, body: { auth: { client_token: token, lease_duration: lease, renewable: true, policies: ["thinx-api"] } } };
		}
		if (op === "encrypt" || op === "decrypt") {
			if (req.headers["x-vault-token"] !== token) return { status: 403, body: { errors: ["permission denied"] } };
		}
		if (op === "encrypt") {
			if (!json || typeof json.plaintext !== "string") return { status: 400, body: { errors: ["missing plaintext"] } };
			const ct = opts.ciphertext || ("vault:v1:" + crypto.randomBytes(24).toString("base64"));
			store.set(ct, json.plaintext);
			return { status: 200, body: { data: { ciphertext: ct, key_version: 1 } } };
		}
		if (op === "decrypt") {
			const pt = json && store.get(json.ciphertext);
			if (typeof pt !== "string") return { status: 400, body: { errors: ["invalid ciphertext"] } };
			return { status: 200, body: { data: { plaintext: pt } } };
		}
		return { status: 404, body: { errors: [] } };
	}

	function answer(res, a) {
		if (a.hang) return; // keep the socket open, never answer
		if (a.oversize) {
			res.writeHead(200, { "content-type": "application/json" });
			res.end("{\"data\":\"" + "a".repeat(70 * 1024) + "\"}");
			return;
		}
		if (typeof a.raw === "string") {
			res.writeHead(a.status || 200, { "content-type": "application/json" });
			res.end(a.raw);
			return;
		}
		send(res, a.status || 200, a.body);
	}

	const server = https.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (req, res) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => {
			const op = OPS[req.url] || "other";
			const index = requests.length;
			const opIndex = counters[op]++;
			requests.push({ method: req.method, path: req.url, op, token: typeof req.headers["x-vault-token"] === "string" });
			let json = null;
			try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (_e) { json = null; }
			let a = state.scriptFn ? state.scriptFn({ op, index, opIndex }) : undefined;
			if (!a || (a.status === undefined && !a.hang && !a.oversize && a.raw === undefined && a.body === undefined)) {
				const d = defaultAnswer(op, req, json);
				a = Object.assign({}, d, a || {});
			}
			if (a.delay) setTimeout(() => answer(res, a), a.delay);
			else answer(res, a);
		});
	});
	server.on("connection", (s) => {
		state.connections++;
		sockets.add(s);
		s.on("close", () => sockets.delete(s));
	});
	server.on("tlsClientError", () => { /* expected in the tls case */ });

	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = server.address().port;

	return {
		addr: "https://127.0.0.1:" + port,
		caFile,
		otherCaFile,
		requests,
		get connections() { return state.connections; },
		count(op) { return requests.filter((r) => r.op === op).length; },
		script(fn) { state.scriptFn = (typeof fn === "function") ? fn : null; },
		close() {
			return new Promise((resolve) => {
				for (const s of sockets) s.destroy();
				server.close(() => {
					fs.rmSync(dir, { recursive: true, force: true });
					resolve();
				});
			});
		}
	};
}

module.exports = { start };
