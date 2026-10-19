/* Integration spec for lib/thinx/transit.js against a real OpenBao 2.7.1 dev
 * server (Phase 40, KEYENC-05).
 *
 * CI: docker-compose.test.yml runs openbao + openbao-setup and hands the api
 * container BAO_ADDR / BAO_CACERT / BAO_ROLE_ID / BAO_SECRET_ID (CI
 * throwaways). Laptop: scripts/openbao-dev.sh run -- npx jasmine ... this file.
 *
 * Without BAO_ADDR every case is pending, except under CIRCLECI=true, where a
 * missing dev server is a wiring bug and fails the suite.
 *
 * Every Transit gets an injected slackNotify stub, so nothing is ever posted.
 */

const crypto = require("crypto");
const expect = require("chai").expect;
const Transit = require("../../lib/thinx/transit.js");
const secrets = require("../../lib/thinx/secrets.js");

const WIRED = typeof process.env.BAO_ADDR === "string" && process.env.BAO_ADDR.length > 0;
const IN_CI = process.env.CIRCLECI === "true";

function guard() {
	if (WIRED) return true;
	if (IN_CI) {
		fail("openbao dev server not wired");
		return false;
	}
	pending("BAO_ADDR not set; run through scripts/openbao-dev.sh run");
	return false;
}

function slackStub() {
	const sent = [];
	return { sent, factory: () => ({ send: (p) => { sent.push(p); return Promise.resolve(); } }) };
}

function countingReadSecret(overrides) {
	const calls = {};
	const fn = (name, def) => {
		calls[name] = (calls[name] || 0) + 1;
		if (overrides && Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
		return secrets.readSecret(name, def);
	};
	return { fn, calls };
}

function makeTransit(extra) {
	const slack = slackStub();
	const opts = Object.assign({ slackNotify: slack.factory, webhook: null }, extra || {});
	return new Transit(opts);
}

async function reasonOf(promise) {
	try {
		await promise;
	} catch (e) {
		expect(e).to.be.instanceOf(Transit.TransitError);
		return e.reason;
	}
	return "resolved";
}

describe("Transit integration (OpenBao dev server)", function () {

	const lines = [];
	const seen = { ciphertexts: [], plaintexts: [] };
	let origLog;

	beforeAll(function () {
		origLog = console.log;
		console.log = function (...args) {
			lines.push(args.map(String).join(" "));
			return origLog.apply(console, args);
		};
	});

	afterAll(function () {
		console.log = origLog;
	});

	it("(I1) round-trips a random 4096-byte Buffer", async function () {
		if (!guard()) return;
		const t = makeTransit();
		const input = crypto.randomBytes(4096);
		const ct = await t.encryptKey(input);
		seen.ciphertexts.push(ct);
		seen.plaintexts.push(input.toString("base64"));
		expect(ct).to.match(/^vault:v[1-9][0-9]*:[A-Za-z0-9+/]+={0,2}$/);
		const out = await t.decryptKey(ct);
		expect(Buffer.isBuffer(out)).to.equal(true);
		expect(out.equals(input)).to.equal(true);
		out.fill(0);
	});

	it("(I2) reuses its token for a second call", async function () {
		if (!guard()) return;
		const rs = countingReadSecret();
		const t = makeTransit({ readSecret: rs.fn });
		const a = await t.encryptKey(Buffer.from("first"));
		const b = await t.encryptKey(Buffer.from("second"));
		seen.ciphertexts.push(a, b);
		expect(rs.calls.BAO_ROLE_ID).to.equal(1);
	});

	it("(I3) a wrong secret_id is denied", async function () {
		if (!guard()) return;
		const rs = countingReadSecret({ BAO_SECRET_ID: "not-the-ci-secret-id" });
		const t = makeTransit({ readSecret: rs.fn });
		expect(await reasonOf(t.encryptKey(Buffer.from("x")))).to.equal("denied");
	});

	it("(I4) a closed port is unreachable", async function () {
		if (!guard()) return;
		const t = makeTransit({ addr: "https://127.0.0.1:1" });
		expect(await reasonOf(t.encryptKey(Buffer.from("x")))).to.equal("unreachable");
	});

	it("(I5) an http: address is not_configured and never reads credentials", async function () {
		if (!guard()) return;
		const rs = countingReadSecret();
		const t = makeTransit({ addr: String(process.env.BAO_ADDR).replace(/^https:/, "http:"), readSecret: rs.fn });
		expect(await reasonOf(t.encryptKey(Buffer.from("x")))).to.equal("not_configured");
		expect(Object.keys(rs.calls).length).to.equal(0);
	});

	it("(I6) a malformed ciphertext is bad_ciphertext", async function () {
		if (!guard()) return;
		const t = makeTransit();
		expect(await reasonOf(t.decryptKey("vault:v1:AAAA"))).to.equal("bad_ciphertext");
	});

	it("(I7) no console line carries a credential, ciphertext or plaintext", function () {
		if (!guard()) return;
		const forbidden = [
			process.env.BAO_ROLE_ID,
			process.env.BAO_SECRET_ID,
			"not-the-ci-secret-id"
		].concat(seen.ciphertexts, seen.plaintexts).filter((v) => typeof v === "string" && v.length > 0);
		expect(seen.ciphertexts.length).to.be.at.least(1);
		for (const line of lines) {
			for (const value of forbidden) {
				expect(line.includes(value)).to.equal(false);
			}
			expect(/vault:v[0-9]+:/.test(line)).to.equal(false);
		}
	});
});
