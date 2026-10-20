/* Rotation spec for the deploy-key Transit key against a real OpenBao 2.7.1 dev
 * server (Phase 41, KEYMIG-03, D-12..D-14).
 *
 * The whole operator sequence of a rotation, end to end: rotate the key, rewrap
 * every stored key through scripts/migrate-deploy-keys.js, raise
 * min_decryption_version to the new latest, then prove that a ciphertext captured
 * before the rotation is refused as retired_version (D-13) with exactly one alert.
 *
 * CI: docker-compose.test.yml hands the api container BAO_ADDR / BAO_CACERT /
 * BAO_ROLE_ID / BAO_SECRET_ID plus the dev server's throwaway root token as
 * BAO_DEV_ADMIN_TOKEN (AR-40-01). Laptop: scripts/openbao-dev.sh run -- npx
 * jasmine ... this file. Without them every case is pending, except under
 * CIRCLECI=true, where a missing dev server is a wiring bug and fails the suite.
 *
 * The dev server is shared with TransitIntegrationSpec and MigrateDeployKeysSpec.
 * This file sorts after both (jasmine runs files in glob order, random false), and
 * afterAll always puts min_decryption_version back to what it found (Pitfall 5).
 * Versions are asserted against what the server reports, never as a literal v1.
 *
 * Output discipline: no ciphertext, token, plaintext or OpenBao error text is ever
 * logged or put in an assertion message. The admin helper reports status and the
 * parsed body to the caller only.
 */

const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const expect = require("chai").expect;
const Transit = require("../../lib/thinx/transit.js");
const RSAKey = require("../../lib/thinx/rsakey.js");
const mig = require("../../scripts/migrate-deploy-keys.js");

const KEY_PATH = "transit/keys/thinx-deploy-keys";
const OWNER = "c3".repeat(32);

const WIRED = typeof process.env.BAO_ADDR === "string" && process.env.BAO_ADDR.length > 0 &&
	typeof process.env.BAO_DEV_ADMIN_TOKEN === "string" && process.env.BAO_DEV_ADMIN_TOKEN.length > 0;
const IN_CI = process.env.CIRCLECI === "true";

function guard() {
	if (WIRED) return true;
	if (IN_CI) {
		fail("openbao dev server or its admin token not wired");
		return false;
	}
	pending("BAO_ADDR / BAO_DEV_ADMIN_TOKEN not set; run through scripts/openbao-dev.sh run");
	return false;
}

function slackStub() {
	const sent = [];
	return { sent, factory: () => ({ send: (p) => { sent.push(p); return Promise.resolve(); } }) };
}

// A Transit whose Slack client is the stub: a webhook value makes it build one.
function makeTransit(slack) {
	return new Transit({ slackNotify: slack.factory, webhook: "https://hooks.invalid/rotation-spec" });
}

async function reasonOf(promise) {
	try {
		await promise;
	} catch (e) {
		expect(e).to.be.instanceOf(Transit.TransitError);
		return { reason: e.reason, status: e.status };
	}
	return { reason: "resolved", status: null };
}

// Operator-side call with the dev root token. Resolves {status, json}; rejects with a
// transport code only. Never logs a body or the token.
function admin(method, apiPath, body) {
	const url = new URL(process.env.BAO_ADDR);
	const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");
	const ca = fs.readFileSync(process.env.BAO_CACERT);
	const data = (body === undefined) ? null : JSON.stringify(body);
	const headers = { "x-vault-token": process.env.BAO_DEV_ADMIN_TOKEN };
	if (data !== null) {
		headers["content-type"] = "application/json";
		headers["content-length"] = Buffer.byteLength(data);
	}
	const options = {
		hostname,
		port: Number(url.port || 8200),
		path: "/v1/" + apiPath,
		method,
		ca,
		rejectUnauthorized: true,
		agent: false,
		signal: AbortSignal.timeout(10000),
		headers
	};
	if (!net.isIP(hostname)) options.servername = hostname;
	return new Promise((resolve, reject) => {
		const req = https.request(options, (res) => {
			const chunks = [];
			res.on("data", (c) => chunks.push(c));
			res.on("end", () => {
				let json = null;
				try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (_e) { json = null; }
				resolve({ status: res.statusCode, json });
			});
			res.on("error", (e) => reject(new Error("admin response failed: " + String((e && e.code) || "error"))));
		});
		req.on("error", (e) => reject(new Error("admin request failed: " + String((e && e.code) || "error"))));
		req.end(data === null ? undefined : data);
	});
}

async function keyInfo() {
	const r = await admin("GET", KEY_PATH);
	expect(r.status, "read key status").to.equal(200);
	const d = r.json && r.json.data;
	expect(Number.isInteger(d && d.latest_version), "latest_version is an integer").to.equal(true);
	expect(Number.isInteger(d && d.min_decryption_version), "min_decryption_version is an integer").to.equal(true);
	return { latest: d.latest_version, min: d.min_decryption_version };
}

async function setMinDecryption(v) {
	return admin("POST", KEY_PATH + "/config", { min_decryption_version: v });
}

function versionOf(ct) {
	const m = /^vault:v([1-9][0-9]*):/.exec(String(ct));
	return m ? Number(m[1]) : null;
}

describe("Transit rotation (OpenBao dev server)", function () {

	const lines = [];
	const seen = { ciphertexts: [] };
	let origLog;
	let origError;
	let L0 = null;
	let M0 = null;
	let dir = null;

	beforeAll(async function () {
		origLog = console.log;
		origError = console.error;
		console.log = function (...args) {
			lines.push(args.map(String).join(" "));
			return origLog.apply(console, args);
		};
		console.error = function (...args) {
			lines.push(args.map(String).join(" "));
			return origError.apply(console, args);
		};
		if (!WIRED) return;
		const info = await keyInfo();
		L0 = info.latest;
		M0 = info.min;
	});

	afterAll(async function () {
		try {
			if (WIRED && M0 !== null) {
				const r = await setMinDecryption(M0);
				expect(r.status, "restore min_decryption_version status").to.be.within(200, 299);
				expect((await keyInfo()).min, "min_decryption_version restored").to.equal(M0);
			}
		} finally {
			console.log = origLog;
			console.error = origError;
			if (dir) fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("(R1) rotate, rewrap, raise the minimum, then an older ciphertext is retired_version with one alert", async function () {
		if (!guard()) return;
		const slack = slackStub();
		const t = makeTransit(slack);

		// 2. The canary: a ciphertext of junk under the current latest version.
		const junk = crypto.randomBytes(32);
		const canary = await t.encryptKey(junk);
		junk.fill(0);
		seen.ciphertexts.push(canary);
		expect(versionOf(canary), "canary version").to.equal(L0);

		// 3. Two stored deploy keys under the current latest version.
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-rot-keys-"));
		const rsakey = Object.create(RSAKey.prototype);
		rsakey.ssh_keys = dir;
		const originals = [];
		for (const ts of [1700000000301, 1700000000302]) {
			const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
			const pem = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }));
			const name = OWNER + "-" + ts;
			const ct = await t.encryptKey(pem);
			seen.ciphertexts.push(ct);
			expect(versionOf(ct), "stored key version").to.equal(L0);
			fs.writeFileSync(path.join(dir, name), ct + "\n", { mode: 0o600 });
			const spki = publicKey.export({ type: "spki", format: "pem" });
			fs.writeFileSync(path.join(dir, name + ".pub"), RSAKey.toOpenSSH(spki, "thinx-" + ts) + "\n", { mode: 0o644 });
			originals.push({ name, pem });
		}
		const env = { sshKeysDir: dir, transit: t, rsakey };

		// 4. Rotate (operator token).
		const rot = await admin("POST", KEY_PATH + "/rotate", {});
		expect(rot.status, "rotate status").to.be.within(200, 299);
		const L1 = (await keyInfo()).latest;
		expect(L1, "latest after rotate").to.equal(L0 + 1);

		// 5. Rewrap through the migration script, then once more for idempotency.
		const rep = await mig.rewrap(env);
		expect(rep.aborted).to.equal(null);
		expect(rep.failed).to.equal(0);
		expect(rep.rewrapped).to.equal(2);
		expect(rep.latest).to.equal("v" + L1);
		for (const o of originals) {
			const stored = fs.readFileSync(path.join(dir, o.name), "utf8").trim();
			seen.ciphertexts.push(stored);
			expect(versionOf(stored), "rewrapped file version").to.equal(L1);
			expect(fs.statSync(path.join(dir, o.name)).mode & 0o777).to.equal(0o600);
			const back = await t.decryptKey(stored);
			expect(back.equals(o.pem), "rewrapped file decrypts to its original bytes").to.equal(true);
			back.fill(0);
		}
		const again = await mig.rewrap(env);
		expect(again.failed).to.equal(0);
		expect(again.rewrapped).to.equal(0);
		expect(again.at_latest).to.equal(2);

		// 6. Raise the minimum to exactly the new latest. One above latest is refused
		// (OpenBao path_keys_config.go), so L1 is the highest value it can take.
		const above = await setMinDecryption(L1 + 1);
		expect(above.status, "a minimum above latest is refused").to.equal(400);
		const raised = await setMinDecryption(L1);
		expect(raised.status, "raise status").to.be.within(200, 299);
		const info = await keyInfo();
		expect(info.min, "min_decryption_version raised").to.equal(L1);
		expect(info.latest).to.equal(L1);

		// 7. The canary from before the rotation is refused, alerted exactly once.
		const first = await reasonOf(t.decryptKey(canary));
		expect(first.reason).to.equal("retired_version");
		expect(first.status).to.equal(400);
		expect(slack.sent.length, "one alert").to.equal(1);
		expect(slack.sent[0].text).to.contain("RETIRED_VERSION");

		const second = await reasonOf(t.decryptKey(canary));
		expect(second.reason).to.equal("retired_version");
		expect(slack.sent.length, "still one alert").to.equal(1);

		const ok = await t.decryptKey(fs.readFileSync(path.join(dir, originals[0].name), "utf8").trim());
		expect(ok.equals(originals[0].pem)).to.equal(true);
		ok.fill(0);
		expect(slack.sent.length, "a later success posts nothing").to.equal(1);
		expect(slack.sent.some((p) => String(p.text).includes("RECOVERED")), "no RECOVERED text").to.equal(false);

		const rw = await reasonOf(t.rewrapKey(canary));
		expect(rw.reason).to.equal("retired_version");
		expect(rw.status).to.equal(400);

		const check = await mig.canaryCheck({ transit: t }, canary);
		expect(check.line).to.equal("CANARY result=retired_version version=v" + L0);
		expect(check.code).to.equal(3);
		expect(slack.sent.length, "one alert for the whole process").to.equal(1);

		for (const o of originals) o.pem.fill(0);
	}, 90000);

	it("(R2) no console line or alert carries a ciphertext, the admin token or OpenBao error text", function () {
		if (!guard()) return;
		expect(seen.ciphertexts.length).to.be.at.least(1);
		const forbidden = [process.env.BAO_DEV_ADMIN_TOKEN, "disallowed by policy", "too old"].concat(seen.ciphertexts);
		const retired = lines.filter((l) => l.indexOf("[transit] ") === 0 && l.includes("retired_version"));
		expect(retired).to.include("[transit] decrypt failed: retired_version status=400");
		expect(retired).to.include("[transit] rewrap failed: retired_version status=400");
		for (const line of lines) {
			expect(/vault:v[0-9]+:/.test(line), "console line holds a ciphertext").to.equal(false);
			for (const f of forbidden) expect(line.includes(f), "console line holds a forbidden value").to.equal(false);
		}
	});
});
