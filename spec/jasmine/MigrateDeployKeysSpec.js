/* Spec for scripts/migrate-deploy-keys.js (Phase 41, KEYMIG-01, KEYMIG-03, D-02..D-04).
 *
 * Unit cases run on spec/fixtures/fake-transit.js and synthetic RSA keys made at
 * test time (crypto.generateKeyPairSync, ssh-keygen); no key material is committed.
 * The "dev server end to end" describe runs against a real OpenBao 2.7.1 dev server:
 * locally through scripts/openbao-dev.sh run, in CI through docker-compose.test.yml.
 * Without BAO_ADDR it does not run locally, and under CIRCLECI=true a missing
 * dev server fails the suite.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const exec = require("child_process");
const expect = require("chai").expect;

// 34-REVIEW WR-05: in development app_config().ssh_keys is $HOME/.ssh. HOME points at a
// throwaway directory before any lib/ module loads, so nothing here can touch a real key.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-home-"));
fs.mkdirSync(path.join(TEST_HOME, ".ssh"), { mode: 0o700 });
process.env.HOME = TEST_HOME;

const RSAKey = require("../../lib/thinx/rsakey.js");
const keyformat = require("../../lib/thinx/keyformat.js");
const Transit = require("../../lib/thinx/transit.js");
const FakeTransit = require("../fixtures/fake-transit.js");
const mig = require("../../scripts/migrate-deploy-keys.js");

const OWNER = "a1".repeat(32);
const TRANSIT_LINE = /^vault:v[1-9][0-9]*:[A-Za-z0-9+/]+={0,2}\n$/;

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

const roots = [];
function tmpDir(prefix) {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	roots.push(d);
	return d;
}

afterAll(function () {
	for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
	fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

// A key directory and an RSAKey bound to it (the DeployKeyNames fixture shape).
function fixture() {
	const dir = tmpDir("thinx-keys-");
	const rsakey = Object.create(RSAKey.prototype);
	rsakey.ssh_keys = dir;
	return { dir, rsakey };
}

function envFor(fx, transit, extra) {
	return Object.assign({
		sshKeysDir: fx.dir,
		transit,
		rsakey: fx.rsakey,
		audit: { log: (owner, message, flag, cb) => cb(true) },
		candidates: [{ label: "secret", value: PASSPHRASE }],
		scratchDir: tmpDir("thinx-scratch-")
	}, extra || {});
}

const PASSPHRASE = "synthetic-" + crypto.randomBytes(8).toString("hex");

function writePub(dir, name, publicKey) {
	const spki = publicKey.export({ type: "spki", format: "pem" });
	const line = RSAKey.toOpenSSH(spki, "thinx-" + name.split("-")[1]) + "\n";
	fs.writeFileSync(path.join(dir, name + ".pub"), line, { mode: 0o644 });
	return RSAKey.fingerprint(line);
}

// A passphrase PKCS#8 deploy key as generate() wrote it before Phase 40.
function writeEncryptedPkcs8(dir, owner, ts, passphrase) {
	const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
	const name = owner + "-" + ts;
	const pem = privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: passphrase || PASSPHRASE });
	fs.writeFileSync(path.join(dir, name), pem, { mode: 0o600 });
	fs.chmodSync(path.join(dir, name), 0o600);
	return { name, fingerprint: writePub(dir, name, publicKey), pem };
}

function fingerprintOfPrivate(buf) {
	const spki = crypto.createPublicKey(buf).export({ type: "spki", format: "pem" });
	return RSAKey.fingerprint(RSAKey.toOpenSSH(spki, "x"));
}

function noPemInDir(dir) {
	for (const name of fs.readdirSync(dir)) {
		const text = fs.readFileSync(path.join(dir, name), "utf8");
		expect(text.includes("PRIVATE KEY"), name).to.equal(false);
	}
}

describe("migrate-deploy-keys (FakeTransit)", function () {

	it("(M1) one passphrase PKCS#8 file becomes one vault:vN: line, mode 0600, same name", async function () {
		const fx = fixture();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000001);
		const t = new FakeTransit();
		const rep = await mig.migrate(envFor(fx, t), { dryRun: false });
		expect(rep.migrated).to.equal(1);
		expect(rep.failed).to.equal(0);
		expect(rep.decrypted_with.secret).to.equal(1);
		const stored = fs.readFileSync(path.join(fx.dir, k.name), "utf8");
		expect(TRANSIT_LINE.test(stored)).to.equal(true);
		expect(fs.statSync(path.join(fx.dir, k.name)).mode & 0o777).to.equal(0o600);
		expect(keyformat.readKey(path.join(fx.dir, k.name)).kind).to.equal("transit");
		expect(mig.exitCode(rep)).to.equal(0);
	});

	it("(M2) the ciphertext decrypts to an unencrypted PKCS#8 PEM with the .pub fingerprint", async function () {
		const fx = fixture();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000002);
		const t = new FakeTransit();
		await mig.migrate(envFor(fx, t), { dryRun: false });
		const ct = fs.readFileSync(path.join(fx.dir, k.name), "utf8").trim();
		const buf = await t.decryptKey(ct);
		try {
			expect(buf.toString("utf8").split("\n")[0]).to.equal("-----BEGIN " + "PRIVATE KEY-----");
			expect(crypto.createPrivateKey({ key: buf, format: "pem" }).asymmetricKeyType).to.equal("rsa");
			expect(fingerprintOfPrivate(buf)).to.equal(k.fingerprint);
		} finally {
			buf.fill(0);
		}
	});

	it("(M3) no file in the key directory holds a PEM private key afterwards", async function () {
		const fx = fixture();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000003);
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000004);
		const rep = await mig.migrate(envFor(fx, new FakeTransit()), { dryRun: false });
		expect(rep.migrated).to.equal(2);
		noPemInDir(fx.dir);
	});

	it("(M4) --report counts by kind and never writes", function () {
		const fx = fixture();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000005);
		const rep = mig.report(envFor(fx, new FakeTransit()));
		expect(rep.mode).to.equal("report");
		expect(rep.private_files).to.equal(1);
		expect(rep.legacy_total).to.equal(1);
		expect(rep.legacy.encrypted_pkcs8).to.equal(1);
		expect(rep.transit_total).to.equal(0);
		const text = mig.formatText(rep);
		expect(text).to.match(/^\[migrate-deploy-keys\] mode +: report$/m);
	});
});

describe("migrate-deploy-keys: dev server end to end", function () {

	const Git = require("../../lib/thinx/git.js");

	function makeTransit() {
		const sent = [];
		return new Transit({ slackNotify: () => ({ send: (p) => { sent.push(p); return Promise.resolve(); } }), webhook: null });
	}

	it("(E1) migrates a passphrase PKCS#8 key through OpenBao into a file the agent path loads", async function () {
		if (!guard()) return;
		const fx = fixture();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000101);
		const t = makeTransit();
		const env = envFor(fx, t);

		const rep = await mig.migrate(env, { dryRun: false });
		expect(rep.migrated).to.equal(1);
		expect(rep.failed).to.equal(0);
		expect(rep.aborted).to.equal(null);

		const privatePath = path.join(fx.dir, k.name);
		const stored = fs.readFileSync(privatePath, "utf8");
		expect(TRANSIT_LINE.test(stored)).to.equal(true);
		expect(fs.statSync(privatePath).mode & 0o777).to.equal(0o600);
		expect(keyformat.readKey(privatePath).kind).to.equal("transit");
		noPemInDir(fx.dir);

		const buf = await t.decryptKey(stored.trim());
		expect(crypto.createPrivateKey({ key: buf, format: "pem" }).asymmetricKeyType).to.equal("rsa");
		expect(fingerprintOfPrivate(buf)).to.equal(k.fingerprint);

		// The build agent path: withAgent loads the decrypted buffer (and zeroes it).
		const git = new Git(null, { gitTimeoutMs: 60000 });
		const listed = await git.withAgent(buf, async (sock) => exec.execFileSync("ssh-add", ["-l", "-E", "sha256"], {
			env: { PATH: process.env.PATH, SSH_AUTH_SOCK: sock },
			encoding: "utf8"
		}).trim().split("\n").filter((l) => l.length > 0));
		expect(listed.length).to.equal(1);
		expect(listed[0].split(/\s+/)[1]).to.equal(k.fingerprint);

		// Idempotent: a second run migrates nothing and fails nothing.
		const again = await mig.migrate(env, { dryRun: false });
		expect(again.migrated).to.equal(0);
		expect(again.failed).to.equal(0);
		expect(again.legacy_total).to.equal(0);
		expect(again.already_transit).to.equal(1);
	}, 60000);
});
