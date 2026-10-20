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

// --- Task 2 fixtures: every legacy kind found on production, plus broken ones ---------

function writePkcs1(dir, owner, ts, passphrase) {
	const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
	const name = owner + "-" + ts;
	const opts = { type: "pkcs1", format: "pem" };
	if (passphrase) Object.assign(opts, { cipher: "aes-256-cbc", passphrase });
	fs.writeFileSync(path.join(dir, name), privateKey.export(opts), { mode: 0o600 });
	return { name, fingerprint: writePub(dir, name, publicKey) };
}

// An `ssh-keygen -N ""` key in the OpenSSH format, made in a separate directory.
function writeOpenSSH(dir, owner, ts, type) {
	const work = tmpDir("thinx-sshkeygen-");
	const base = path.join(work, "k");
	const args = (type === "ed25519") ? ["-q", "-t", "ed25519", "-N", "", "-f", base] : ["-q", "-t", "rsa", "-b", "2048", "-N", "", "-f", base];
	exec.execFileSync("ssh-keygen", args, { stdio: "ignore", env: { PATH: process.env.PATH } });
	const name = owner + "-" + ts;
	fs.copyFileSync(base, path.join(dir, name));
	fs.chmodSync(path.join(dir, name), 0o600);
	const pub = fs.readFileSync(base + ".pub", "utf8");
	fs.writeFileSync(path.join(dir, name + ".pub"), pub, { mode: 0o644 });
	fs.rmSync(work, { recursive: true, force: true });
	return { name, fingerprint: RSAKey.fingerprint(pub) };
}

function writeGarbagePem(dir, owner, ts) {
	const name = owner + "-" + ts;
	const armor = (label) => "-----" + label + " ENCRYPTED " + "PRIVATE KEY-----";
	const body = crypto.randomBytes(300).toString("base64").replace(/(.{64})/g, "$1\n");
	fs.writeFileSync(path.join(dir, name), armor("BEGIN") + "\n" + body + "\n" + armor("END") + "\n", { mode: 0o600 });
	const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
	writePub(dir, name, publicKey);
	return { name };
}

async function writeTransit(dir, owner, ts, transit) {
	const name = owner + "-" + ts;
	const ct = await transit.encryptKey(crypto.randomBytes(64));
	fs.writeFileSync(path.join(dir, name), ct + "\n", { mode: 0o600 });
	fs.writeFileSync(path.join(dir, name + ".pub"), "ssh-rsa AAAA synthetic\n", { mode: 0o644 });
	return { name, ct };
}

// Names, contents and modes of every entry in a directory.
function snapshot(dir) {
	return fs.readdirSync(dir).sort().map((name) => {
		const p = path.join(dir, name);
		return { name, mode: fs.statSync(p).mode & 0o777, sha: crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") };
	});
}

function totalCalls(t) {
	return Object.values(t.calls).reduce((a, b) => a + b, 0);
}

function auditStub() {
	const calls = [];
	return { calls, log: (owner, message, flag, cb) => { calls.push({ owner, message, flag }); setImmediate(() => cb(true)); } };
}

describe("migrate-deploy-keys: every legacy kind, quarantine, dry-run, abort, races", function () {

	it("(B1) an unencrypted PKCS#1 key migrates without a passphrase; a Proc-Type one with the candidates", async function () {
		const fx = fixture();
		const plain = writePkcs1(fx.dir, OWNER, 1700000000201);
		const locked = writePkcs1(fx.dir, OWNER, 1700000000202, PASSPHRASE);
		const t = new FakeTransit();
		const rep = await mig.migrate(envFor(fx, t), { dryRun: false });
		expect(rep.legacy.pkcs1).to.equal(2);
		expect(rep.migrated).to.equal(2);
		expect(rep.failed).to.equal(0);
		expect(rep.decrypted_with).to.deep.equal({ secret: 1, historic_literal: 0, unencrypted: 1 });
		for (const k of [plain, locked]) {
			const buf = await t.decryptKey(fs.readFileSync(path.join(fx.dir, k.name), "utf8").trim());
			try {
				expect(buf.toString("utf8").split("\n")[0]).to.equal("-----BEGIN " + "PRIVATE KEY-----");
				expect(fingerprintOfPrivate(buf)).to.equal(k.fingerprint);
			} finally {
				buf.fill(0);
			}
		}
		noPemInDir(fx.dir);
	});

	it("(B1b) the historic literal opens a key the secret does not", async function () {
		const fx = fixture();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000203, "thinx");
		const env = envFor(fx, new FakeTransit(), { candidates: [{ label: "secret", value: PASSPHRASE }, { label: "historic_literal", value: "thinx" }] });
		const rep = await mig.migrate(env, { dryRun: false });
		expect(rep.migrated).to.equal(1);
		expect(rep.decrypted_with).to.deep.equal({ secret: 0, historic_literal: 1, unencrypted: 0 });
	});

	it("(B1c) a .pub of another key counts pub_mismatch and still migrates", async function () {
		const fx = fixture();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000204);
		const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
		writePub(fx.dir, k.name, publicKey);
		const rep = await mig.migrate(envFor(fx, new FakeTransit()), { dryRun: false });
		expect(rep.pub_mismatch).to.equal(1);
		expect(rep.migrated).to.equal(1);
	});

	it("(B2) an unencrypted OpenSSH key migrates through the scratch conversion with the same public key", async function () {
		const fx = fixture();
		const k = writeOpenSSH(fx.dir, OWNER, 1700000000205, "rsa");
		const t = new FakeTransit();
		const env = envFor(fx, t);
		const rep = await mig.migrate(env, { dryRun: false });
		expect(rep.legacy.openssh).to.equal(1);
		expect(rep.migrated).to.equal(1);
		expect(rep.decrypted_with.unencrypted).to.equal(1);
		const buf = await t.decryptKey(fs.readFileSync(path.join(fx.dir, k.name), "utf8").trim());
		try {
			expect(buf.toString("utf8").split("\n")[0]).to.equal("-----BEGIN " + "PRIVATE KEY-----");
			expect(fingerprintOfPrivate(buf)).to.equal(k.fingerprint);
		} finally {
			buf.fill(0);
		}
		expect(fs.readdirSync(env.scratchDir)).to.deep.equal([]);
		noPemInDir(fx.dir);
	});

	it("(B2b) without a scratch directory an OpenSSH key fails no_scratch_tmpfs and is not quarantined", async function () {
		const fx = fixture();
		const k = writeOpenSSH(fx.dir, OWNER, 1700000000206, "rsa");
		const before = snapshot(fx.dir);
		const rep = await mig.migrate(envFor(fx, new FakeTransit(), { scratchDir: path.join(fx.dir, "no-such-dir") }), { dryRun: false });
		expect(rep.failed).to.equal(1);
		expect(rep.failures).to.deep.equal([{ owner: OWNER, key: k.name.split("-")[1], cause: "no_scratch_tmpfs" }]);
		expect(rep.quarantined).to.equal(0);
		expect(snapshot(fx.dir)).to.deep.equal(before);
	});

	it("(B3) wrong passphrase, unparseable and ed25519 keys are quarantined with one owner notice each; the next key still migrates", async function () {
		const fx = fixture();
		const wrong = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000301, "not-the-passphrase");
		const garbage = writeGarbagePem(fx.dir, OWNER, 1700000000302);
		const ed = writeOpenSSH(fx.dir, OWNER, 1700000000303, "ed25519");
		const good = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000304);
		const audit = auditStub();
		const rep = await mig.migrate(envFor(fx, new FakeTransit(), { audit }), { dryRun: false });
		expect(rep.quarantine).to.deep.equal([
			{ owner: OWNER, key: "1700000000301", cause: "wrong_passphrase" },
			{ owner: OWNER, key: "1700000000302", cause: "unparseable" },
			{ owner: OWNER, key: "1700000000303", cause: "unsupported_type" }
		]);
		expect(rep.quarantined).to.equal(3);
		expect(rep.notified).to.equal(3);
		expect(rep.failed).to.equal(0);
		expect(rep.migrated).to.equal(1);
		expect(mig.exitCode(rep)).to.equal(0);
		for (const k of [wrong, garbage, ed]) {
			expect(fs.existsSync(path.join(fx.dir, k.name))).to.equal(false);
			expect(fs.existsSync(path.join(fx.dir, k.name + ".pub"))).to.equal(false);
		}
		expect(keyformat.readKey(path.join(fx.dir, good.name)).kind).to.equal("transit");
		expect(audit.calls.length).to.equal(3);
		for (const c of audit.calls) {
			expect(c.owner).to.equal(OWNER);
			expect(c.flag).to.equal("warning");
			expect(c.message).to.equal("A deploy key created 2023-11-14 could not be moved to the key service and was removed. Create a new deploy key and add it to your repository.");
			expect(c.message.includes("PRIVATE KEY") || c.message.includes("vault:") || c.message.includes("/")).to.equal(false);
		}
	});

	it("(B3b) an audit log that never answers is not waited for past the bound", async function () {
		const fx = fixture();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000305, "not-the-passphrase");
		const audit = { log: () => { /* never calls back */ } };
		const rep = await mig.migrate(envFor(fx, new FakeTransit(), { audit, auditTimeoutMs: 50 }), { dryRun: false });
		expect(rep.quarantined).to.equal(1);
		expect(rep.notified).to.equal(0);
	});

	async function mixedDir() {
		const fx = fixture();
		const t = new FakeTransit();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000401);
		writePkcs1(fx.dir, OWNER, 1700000000402);
		writeOpenSSH(fx.dir, OWNER, 1700000000403, "rsa");
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000404, "not-the-passphrase");
		await writeTransit(fx.dir, OWNER, 1700000000405, t);
		fs.writeFileSync(path.join(fx.dir, OWNER + "-1700000000406"), "", { mode: 0o600 });
		fs.writeFileSync(path.join(fx.dir, OWNER + "-1700000000406.pub"), "ssh-rsa AAAA synthetic\n", { mode: 0o644 });
		t.calls.encrypt = 0;
		return { fx, t };
	}

	it("(B4) --dry-run touches nothing, makes no Transit call and predicts what --migrate does", async function () {
		const { fx, t } = await mixedDir();
		const audit = auditStub();
		const env = envFor(fx, t, { audit });
		const before = snapshot(fx.dir);
		const dry = await mig.migrate(env, { dryRun: true });
		expect(snapshot(fx.dir)).to.deep.equal(before);
		expect(totalCalls(t)).to.equal(0);
		expect(audit.calls.length).to.equal(0);
		expect(dry.mode).to.equal("dry-run");
		expect(dry.writes).to.equal(0);
		expect(dry.transit_requests).to.equal(0);
		expect(dry.predicted).to.deep.equal({ migrate: 3, quarantine: 1 });
		expect(dry.migrated).to.equal(0);
		expect(dry.quarantined).to.equal(0);
		expect(fs.readdirSync(env.scratchDir)).to.deep.equal([]);
		const real = await mig.migrate(env, { dryRun: false });
		expect(real.migrated).to.equal(dry.predicted.migrate);
		expect(real.quarantined).to.equal(dry.predicted.quarantine);
		expect(real.quarantine).to.deep.equal(dry.quarantine);
	});

	it("(B5) a second --migrate migrates nothing, fails nothing and writes nothing", async function () {
		const { fx, t } = await mixedDir();
		const env = envFor(fx, t);
		await mig.migrate(env, { dryRun: false });
		const again = await mig.migrate(env, { dryRun: false });
		expect(again.migrated).to.equal(0);
		expect(again.failed).to.equal(0);
		expect(again.legacy_total).to.equal(0);
		expect(again.quarantined).to.equal(0);
		expect(again.writes).to.equal(0);
		expect(again.already_transit).to.equal(again.private_files - again.unknown);
		expect(again.unknown).to.equal(1);
	});

	it("(B6) unreachable aborts with exit 1, changes no file and quarantines nothing", async function () {
		const fx = fixture();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000601);
		writePkcs1(fx.dir, OWNER, 1700000000602);
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000603);
		const before = snapshot(fx.dir);
		const t = new FakeTransit({ failReason: "unreachable", failOps: ["encrypt"] });
		const rep = await mig.migrate(envFor(fx, t), { dryRun: false });
		expect(rep.aborted).to.equal("unreachable");
		expect(mig.exitCode(rep)).to.equal(1);
		expect(rep.failed).to.equal(3);
		expect(rep.quarantined).to.equal(0);
		expect(rep.migrated).to.equal(0);
		expect(t.calls.encrypt).to.equal(1);
		expect(snapshot(fx.dir)).to.deep.equal(before);
	});

	it("(B6b) a per-key server_error fails that key and the run carries on", async function () {
		const fx = fixture();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000611);
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000612);
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000000613);
		const t = new FakeTransit();
		const orig = t.encryptKey.bind(t);
		let n = 0;
		t.encryptKey = async (buf) => {
			if (n++ === 0) throw new FakeTransit.TransitError("server_error", 500);
			return orig(buf);
		};
		const rep = await mig.migrate(envFor(fx, t), { dryRun: false });
		expect(rep.aborted).to.equal(null);
		expect(rep.failures).to.deep.equal([{ owner: OWNER, key: "1700000000611", cause: "server_error" }]);
		expect(rep.migrated).to.equal(2);
		expect(mig.exitCode(rep)).to.equal(1);
	});

	it("(B7) a revoke during the rename leaves no private file behind", async function () {
		const fx = fixture();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000701);
		const target = path.join(fx.dir, k.name);
		const orig = fs.renameSync;
		spyOn(fs, "renameSync").and.callFake(function (from, to) {
			if (to === target) {
				fs.unlinkSync(target);
				fs.unlinkSync(target + ".pub");
			}
			return orig.call(fs, from, to);
		});
		const rep = await mig.migrate(envFor(fx, new FakeTransit()), { dryRun: false });
		expect(fs.existsSync(target)).to.equal(false);
		expect(fs.existsSync(target + ".pub")).to.equal(false);
		expect(rep.migrated).to.equal(0);
		expect(rep.changed_during_run).to.equal(1);
		expect(fs.readdirSync(fx.dir)).to.deep.equal([]);
	});

	it("(B7b) content changed between read and rename is kept and counts changed_during_run", async function () {
		const fx = fixture();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000702);
		const target = path.join(fx.dir, k.name);
		const replacement = "vault:v1:" + crypto.randomBytes(24).toString("base64") + "\n";
		spyOn(fx.rsakey, "keyStillListed").and.callFake(function () {
			fs.writeFileSync(target, replacement, { mode: 0o600 });
			return true;
		});
		const rep = await mig.migrate(envFor(fx, new FakeTransit()), { dryRun: false });
		expect(fs.readFileSync(target, "utf8")).to.equal(replacement);
		expect(rep.changed_during_run).to.equal(1);
		expect(rep.migrated).to.equal(0);
		expect(fs.readdirSync(fx.dir).filter((n) => n.startsWith("."))).to.deep.equal([]);
	});

	it("(B8) a writing run removes its own leftover temps and no other dot-file", async function () {
		const fx = fixture();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000000801);
		const leftover = "." + k.name + ".0123456789ab.keymig.tmp";
		const others = ["." + k.name + ".0123456789ab.keymig.tmp.bak", "." + k.name + ".pub.0123456789ab.tmp", "." + k.name + ".xyz.keymig.tmp"];
		for (const n of [leftover].concat(others)) fs.writeFileSync(path.join(fx.dir, n), "x", { mode: 0o600 });
		const env = envFor(fx, new FakeTransit());
		expect(mig.report(env).leftover_tmp).to.equal(1);
		const dry = await mig.migrate(env, { dryRun: true });
		expect(dry.writes).to.equal(0);
		expect(fs.existsSync(path.join(fx.dir, leftover))).to.equal(true);
		await mig.migrate(env, { dryRun: false });
		expect(fs.existsSync(path.join(fx.dir, leftover))).to.equal(false);
		for (const n of others) expect(fs.existsSync(path.join(fx.dir, n)), n).to.equal(true);
	});

	it("(B9) an empty directory gives zero counts; a zero-byte file is unknown; a transit file is never re-encrypted", async function () {
		const empty = fixture();
		const t0 = new FakeTransit();
		const r0 = await mig.migrate(envFor(empty, t0), { dryRun: false });
		for (const k of ["private_files", "transit_total", "legacy_total", "unknown", "unreadable", "migrated", "already_transit", "quarantined", "failed", "writes", "transit_requests"]) {
			expect(r0[k], k).to.equal(0);
		}
		expect(r0.transit).to.deep.equal({});
		expect(r0.legacy).to.deep.equal({ encrypted_pkcs8: 0, pkcs1: 0, openssh: 0, other: 0 });
		expect(mig.exitCode(r0)).to.equal(0);
		expect(totalCalls(t0)).to.equal(0);

		const fx = fixture();
		const t = new FakeTransit();
		const tr = await writeTransit(fx.dir, OWNER, 1700000000901, t);
		const zero = path.join(fx.dir, OWNER + "-1700000000902");
		fs.writeFileSync(zero, "", { mode: 0o600 });
		t.calls.encrypt = 0;
		const rep = await mig.migrate(envFor(fx, t), { dryRun: false });
		expect(rep.unknown).to.equal(1);
		expect(rep.already_transit).to.equal(1);
		expect(rep.migrated).to.equal(0);
		expect(t.calls.encrypt).to.equal(0);
		expect(fs.readFileSync(zero).length).to.equal(0);
		expect(fs.readFileSync(path.join(fx.dir, tr.name), "utf8").trim()).to.equal(tr.ct);
	});

	it("(B10) two dry-runs give identical reports, with quarantine entries in file-name byte order", async function () {
		const fx = fixture();
		const OTHER = "0f".repeat(32);
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000001905, "not-the-passphrase");
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000001901, "not-the-passphrase");
		writeEncryptedPkcs8(fx.dir, OTHER, 1700000001909, "not-the-passphrase");
		writePkcs1(fx.dir, OWNER, 1700000001903);
		const env = envFor(fx, new FakeTransit());
		const a = await mig.migrate(env, { dryRun: true });
		const b = await mig.migrate(env, { dryRun: true });
		expect(a).to.deep.equal(b);
		expect(JSON.stringify(a)).to.equal(JSON.stringify(b));
		expect(a.quarantine.map((q) => q.owner + "-" + q.key)).to.deep.equal([
			OTHER + "-1700000001909", OWNER + "-1700000001901", OWNER + "-1700000001905"
		]);
	});

	it("(B11) no report, text or JSON, carries a PEM, ciphertext, the passphrase, key body or a path", async function () {
		const fx = fixture();
		const t = new FakeTransit();
		const k = writeEncryptedPkcs8(fx.dir, OWNER, 1700000001101);
		writePkcs1(fx.dir, OWNER, 1700000001102);
		writeOpenSSH(fx.dir, OWNER, 1700000001103, "rsa");
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000001104, "not-the-passphrase");
		writeGarbagePem(fx.dir, OWNER, 1700000001105);
		await writeTransit(fx.dir, OWNER, 1700000001106, t);
		const env = envFor(fx, t);
		const bodyRun = k.pem.split("\n")[1].slice(0, 40);
		const reports = [mig.report(env), await mig.migrate(env, { dryRun: true }), await mig.migrate(env, { dryRun: false }), await mig.migrate(env, { dryRun: false })];
		const down = fixture();
		writeEncryptedPkcs8(down.dir, OWNER, 1700000001107);
		reports.push(await mig.migrate(envFor(down, new FakeTransit({ failReason: "sealed" })), { dryRun: false }));
		for (const r of reports) {
			for (const out of [mig.formatText(r), JSON.stringify(r)]) {
				for (const banned of ["PRIVATE KEY", "vault:v", PASSPHRASE, "not-the-passphrase", bodyRun, fx.dir, down.dir, env.scratchDir, os.tmpdir()]) {
					expect(out.includes(banned), banned).to.equal(false);
				}
			}
		}
	});

	it("(B12) FakeTransit: versions, rotate() and rewrapKey; the report lists versions in ascending order", async function () {
		const t = new FakeTransit();
		expect(t.version).to.equal(1);
		const fx = fixture();
		const v1 = await t.encryptKey(Buffer.from("one"));
		expect(v1).to.match(/^vault:v1:/);
		t.rotate();
		expect(t.version).to.equal(2);
		const v2 = await t.encryptKey(Buffer.from("two"));
		expect(v2).to.match(/^vault:v2:/);
		// v2 sorts first by name, v1 second: the map must still be v1, v2.
		fs.writeFileSync(path.join(fx.dir, OWNER + "-1700000001201"), v2 + "\n", { mode: 0o600 });
		fs.writeFileSync(path.join(fx.dir, OWNER + "-1700000001202"), v1 + "\n", { mode: 0o600 });
		const rep = mig.report(envFor(fx, t));
		expect(Object.keys(rep.transit)).to.deep.equal(["v1", "v2"]);
		expect(rep.transit).to.deep.equal({ v1: 1, v2: 1 });

		const re = await t.rewrapKey(v1);
		expect(re.version).to.equal(2);
		expect(re.ciphertext).to.match(/^vault:v2:/);
		const back = await t.decryptKey(re.ciphertext);
		expect(back.toString()).to.equal("one");
		expect(t.calls.rewrap).to.equal(1);
		let reason = null;
		try { await t.rewrapKey("vault:v1:AAAA"); } catch (e) { reason = e.reason; }
		expect(reason).to.equal("bad_ciphertext");
		expect(t.calls.rewrap).to.equal(2);
		const down = new FakeTransit({ failReason: "sealed" });
		reason = null;
		try { await down.rewrapKey(v1); } catch (e) { reason = e.reason; }
		expect(reason).to.equal("sealed");
	});
});

describe("migrate-deploy-keys: rewrap, canary and fetch-check (KEYMIG-03)", function () {

	async function rewrapDir() {
		const fx = fixture();
		const t = new FakeTransit();
		const plain = new Map();
		for (const ts of [1700000003001, 1700000003002, 1700000003003]) {
			const name = OWNER + "-" + ts;
			const bytes = crypto.randomBytes(64);
			plain.set(name, bytes);
			fs.writeFileSync(path.join(fx.dir, name), (await t.encryptKey(bytes)) + "\n", { mode: 0o600 });
			fs.writeFileSync(path.join(fx.dir, name + ".pub"), "ssh-rsa AAAA synthetic\n", { mode: 0o644 });
		}
		const legacy = writeEncryptedPkcs8(fx.dir, OWNER, 1700000003004);
		fs.writeFileSync(path.join(fx.dir, OWNER + "-1700000003005"), "not a key\n", { mode: 0o600 });
		t.calls.encrypt = 0;
		return { fx, t, plain, legacy };
	}

	function pick(dir, names) {
		return snapshot(dir).filter((s) => names.includes(s.name));
	}

	it("(W4) --rewrap after rotate() brings every Transit file to the latest version, then is a no-op", async function () {
		const { fx, t, plain, legacy } = await rewrapDir();
		const untouched = [legacy.name, legacy.name + ".pub", OWNER + "-1700000003005"];
		const before = pick(fx.dir, untouched);
		t.rotate();
		const env = envFor(fx, t);
		const rep = await mig.rewrap(env);
		expect(rep.mode).to.equal("rewrap");
		expect(rep.latest).to.equal("v2");
		expect(rep.versions_before).to.deep.equal({ v1: 3 });
		expect(rep.versions_after).to.deep.equal({ v2: 3 });
		expect(rep.rewrapped).to.equal(3);
		expect(rep.at_latest).to.equal(0);
		expect(rep.failed).to.equal(0);
		expect(rep.writes).to.equal(3);
		expect(rep.aborted).to.equal(null);
		expect(rep.legacy_total).to.equal(1);
		expect(rep.unknown).to.equal(1);
		expect(mig.exitCode(rep)).to.equal(0);
		for (const [name, bytes] of plain) {
			const p = path.join(fx.dir, name);
			const stored = fs.readFileSync(p, "utf8");
			expect(stored).to.match(/^vault:v2:[A-Za-z0-9+/]+={0,2}\n$/);
			expect(fs.statSync(p).mode & 0o777).to.equal(0o600);
			const back = await t.decryptKey(stored.trim());
			expect(back.equals(bytes)).to.equal(true);
			back.fill(0);
		}
		expect(pick(fx.dir, untouched)).to.deep.equal(before);
		expect(fs.readdirSync(fx.dir).filter((n) => n.startsWith("."))).to.deep.equal([]);

		const rewraps = t.calls.rewrap;
		const again = await mig.rewrap(env);
		expect(again.rewrapped).to.equal(0);
		expect(again.at_latest).to.equal(3);
		expect(again.writes).to.equal(0);
		expect(again.versions_before).to.deep.equal({ v2: 3 });
		expect(t.calls.rewrap).to.equal(rewraps);
	});

	it("(W4b) a file rewritten during the rewrap is kept and counts changed_during_run", async function () {
		const { fx, t } = await rewrapDir();
		t.rotate();
		const target = path.join(fx.dir, OWNER + "-1700000003001");
		const replacement = "vault:v2:" + crypto.randomBytes(24).toString("base64") + "\n";
		let done = false;
		spyOn(fx.rsakey, "keyStillListed").and.callFake(function (owner, filename) {
			if (!done && filename === OWNER + "-1700000003001") {
				done = true;
				fs.writeFileSync(target, replacement, { mode: 0o600 });
			}
			return true;
		});
		const rep = await mig.rewrap(envFor(fx, t));
		expect(rep.changed_during_run).to.equal(1);
		expect(rep.rewrapped).to.equal(2);
		expect(fs.readFileSync(target, "utf8")).to.equal(replacement);
	});

	it("(W4c) a sealed Transit aborts the rewrap with exit 1 and changes no file", async function () {
		const { fx, t } = await rewrapDir();
		t.rotate();
		const before = snapshot(fx.dir);
		t.fail("sealed", ["rewrap"]);
		const rep = await mig.rewrap(envFor(fx, t));
		expect(rep.aborted).to.equal("sealed");
		expect(rep.failed).to.equal(3);
		expect(rep.rewrapped).to.equal(0);
		expect(mig.exitCode(rep)).to.equal(1);
		expect(t.calls.rewrap).to.equal(1);
		expect(snapshot(fx.dir)).to.deep.equal(before);
	});

	it("(W5) --rewrap with no Transit file makes no request and exits 0", async function () {
		const fx = fixture();
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000003101);
		const t = new FakeTransit();
		const rep = await mig.rewrap(envFor(fx, t));
		expect(rep.rewrapped).to.equal(0);
		expect(rep.at_latest).to.equal(0);
		expect(rep.failed).to.equal(0);
		expect(rep.writes).to.equal(0);
		expect(totalCalls(t)).to.equal(0);
		expect(mig.exitCode(rep)).to.equal(0);
		const empty = await mig.rewrap(envFor(fixture(), t));
		expect(empty.private_files).to.equal(0);
		expect(empty.versions_before).to.deep.equal({});
		expect(mig.exitCode(empty)).to.equal(0);
	});

	it("(W6) canary capture gives one vault: line; check prints only the result class and version", async function () {
		const t = new FakeTransit();
		const ct = await mig.canaryCapture({ transit: t });
		expect(ct).to.match(/^vault:v1:[A-Za-z0-9+/]+={0,2}$/);
		const ok = await mig.canaryCheck({ transit: t }, ct + "\n");
		expect(ok).to.deep.equal({ line: "CANARY result=ok version=v1", code: 0 });
		const bad = await mig.canaryCheck({ transit: t }, "garbage");
		expect(bad).to.deep.equal({ line: "CANARY result=bad_ciphertext version=none", code: 3 });
		t.rotate();
		const sealed = new FakeTransit({ failReason: "sealed" });
		expect((await mig.canaryCheck({ transit: sealed }, ct)).line).to.equal("CANARY result=sealed version=v1");
		const client = mig.canaryTransit();
		expect(client._slackClient()).to.equal(null);
	});

	it("(W7) fetch-check runs fetchDetailed into a temp dir it removes and prints the key counts", async function () {
		const fx = fixture();
		const t = new FakeTransit();
		await writeTransit(fx.dir, OWNER, 1700000003201, t);
		writeEncryptedPkcs8(fx.dir, OWNER, 1700000003202);
		writeEncryptedPkcs8(fx.dir, "0f".repeat(32), 1700000003203);
		const seen = {};
		const git = {
			fetchDetailed: async (owner, url, branch, dir) => {
				Object.assign(seen, { owner, url, branch, dir, existed: fs.existsSync(dir) });
				return { ok: true, keyUnavailable: null };
			}
		};
		const r = await mig.fetchCheck(envFor(fx, t, { git }), OWNER, "git@github.com:suculent/private.git", "main");
		expect(r).to.deep.equal({ line: "FETCH_CHECK ok=true key_unavailable=none keys=2 transit=1 legacy=1 other=0", code: 0 });
		expect(seen.owner).to.equal(OWNER);
		expect(seen.existed).to.equal(true);
		expect(fs.existsSync(seen.dir)).to.equal(false);

		git.fetchDetailed = async (owner, url, branch, dir) => { seen.dir2 = dir; return { ok: false, keyUnavailable: "bad_ciphertext" }; };
		const no = await mig.fetchCheck(envFor(fx, t, { git }), OWNER, "git@github.com:suculent/private.git", "main");
		expect(no).to.deep.equal({ line: "FETCH_CHECK ok=false key_unavailable=bad_ciphertext keys=2 transit=1 legacy=1 other=0", code: 1 });
		expect(fs.existsSync(seen.dir2)).to.equal(false);

		let called = 0;
		const stub = { fetchDetailed: async () => { called++; return { ok: true, keyUnavailable: null }; } };
		for (const owner of ["not-an-owner", OWNER.toUpperCase(), OWNER + "0", "../" + OWNER]) {
			const u = await mig.fetchCheck(envFor(fx, t, { git: stub }), owner, "git@github.com:suculent/private.git", "main");
			expect(u.code, owner).to.equal(2);
		}
		expect(called).to.equal(0);
	});

	it("(W8) rewrap and canary reports carry no ciphertext or path", async function () {
		const { fx, t } = await rewrapDir();
		t.rotate();
		const env = envFor(fx, t);
		const outs = [];
		const rep = await mig.rewrap(env);
		outs.push(mig.formatText(rep), JSON.stringify(rep));
		outs.push((await mig.canaryCheck({ transit: t }, await mig.canaryCapture({ transit: t }))).line);
		for (const out of outs) {
			for (const banned of ["vault:v", "PRIVATE KEY", fx.dir, os.tmpdir()]) expect(out.includes(banned), banned).to.equal(false);
		}
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

	it("(E2) rewrapKey, --rewrap and the canary work through the dev server's AppRole", async function () {
		if (!guard()) return;
		const t = makeTransit();
		const bytes = crypto.randomBytes(48);
		const ct = await t.encryptKey(bytes);
		const r = await t.rewrapKey(ct);
		expect(r.version).to.equal(Number(/^vault:v([0-9]+):/.exec(ct)[1]));
		expect(r.ciphertext).to.match(/^vault:v[1-9][0-9]*:/);
		const back = await t.decryptKey(r.ciphertext);
		expect(back.equals(bytes)).to.equal(true);
		back.fill(0);

		// Every file is already at the latest version on an unrotated dev key.
		const fx = fixture();
		fs.writeFileSync(path.join(fx.dir, OWNER + "-1700000000201"), ct + "\n", { mode: 0o600 });
		const rep = await mig.rewrap(envFor(fx, t));
		expect(rep.failed).to.equal(0);
		expect(rep.rewrapped).to.equal(0);
		expect(rep.at_latest).to.equal(1);
		expect(rep.latest).to.match(/^v[1-9][0-9]*$/);

		const canary = await mig.canaryCapture({ transit: t });
		const check = await mig.canaryCheck({ transit: t }, canary);
		expect(check.code).to.equal(0);
		expect(check.line).to.match(/^CANARY result=ok version=v[1-9][0-9]*$/);
	}, 60000);
});
