/* Spec for scripts/migrate-deploy-keys.js (Phase 41, KEYMIG-02, KEYMIG-03, D-12, D-14).
 *
 * The legacy migration (KEYMIG-01) ran in Phase 41 and is retired (KEYMIG-02):
 * --dry-run and --migrate exit 2, and the script holds no conversion code. These
 * specs cover what stays: --report (legacy files still counted by first-line kind,
 * never touched), --rewrap, the canary modes and --fetch-check.
 *
 * Unit cases run on spec/fixtures/fake-transit.js and synthetic RSA keys made at
 * test time (crypto.generateKeyPairSync); no key material is committed. The
 * "dev server end to end" describe runs against a real OpenBao 2.7.1 dev server:
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
const Transit = require("../../lib/thinx/transit.js");
const FakeTransit = require("../fixtures/fake-transit.js");
const mig = require("../../scripts/migrate-deploy-keys.js");

const SCRIPT = path.join(__dirname, "../../scripts/migrate-deploy-keys.js");
const OWNER = "a1".repeat(32);
const RETIRED = "[migrate-deploy-keys] legacy migration retired (KEYMIG-02); use --report";

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
		rsakey: fx.rsakey
	}, extra || {});
}

const PASSPHRASE = "synthetic-" + crypto.randomBytes(8).toString("hex");

function writePub(dir, name, publicKey) {
	const spki = publicKey.export({ type: "spki", format: "pem" });
	const line = RSAKey.toOpenSSH(spki, "thinx-" + name.split("-")[1]) + "\n";
	fs.writeFileSync(path.join(dir, name + ".pub"), line, { mode: 0o644 });
	return RSAKey.fingerprint(line);
}

// A passphrase PKCS#8 deploy key as generate() wrote it before Phase 40: after the
// removal, a file restored from an old backup looks like this.
function writeEncryptedPkcs8(dir, owner, ts) {
	const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
	const name = owner + "-" + ts;
	const pem = privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: PASSPHRASE });
	fs.writeFileSync(path.join(dir, name), pem, { mode: 0o600 });
	fs.chmodSync(path.join(dir, name), 0o600);
	return { name, fingerprint: writePub(dir, name, publicKey), pem };
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

// One encrypted-PKCS#8 file, one Transit file and one unknown file (X2, X3).
async function threeKindDir() {
	const fx = fixture();
	const t = new FakeTransit();
	const legacy = writeEncryptedPkcs8(fx.dir, OWNER, 1700000004001);
	const transit = await writeTransit(fx.dir, OWNER, 1700000004002, t);
	const unknownName = OWNER + "-1700000004003";
	fs.writeFileSync(path.join(fx.dir, unknownName), "not a key\n", { mode: 0o600 });
	t.calls.encrypt = 0;
	return { fx, t, legacy, transit, unknownName };
}

// The script as a child process, HOME at the throwaway directory, no Transit wiring.
function runCli(args) {
	return exec.spawnSync(process.execPath, [SCRIPT].concat(args), {
		env: {
			PATH: process.env.PATH,
			HOME: TEST_HOME,
			ENVIRONMENT: process.env.ENVIRONMENT || "development",
			COUCHDB_USER: process.env.COUCHDB_USER || "u",
			COUCHDB_PASS: process.env.COUCHDB_PASS || "p"
		},
		encoding: "utf8",
		timeout: 30000
	});
}

describe("migrate-deploy-keys: the legacy migration is retired (KEYMIG-02)", function () {

	for (const mode of ["--dry-run", "--migrate"]) {
		it(`(X1) ${mode} prints the retired message on stderr and exits 2`, function () {
			for (const args of [[mode], [mode, "--json"]]) {
				const r = runCli(args);
				expect(r.status, args.join(" ")).to.equal(2);
				expect(r.stdout, args.join(" ")).to.equal("");
				expect(r.stderr.trim().split("\n"), args.join(" ")).to.deep.equal([RETIRED]);
			}
		}, 30000);
	}

	it("(X1b) the module has no migrate export; the post-migration modes stay", function () {
		expect(mig.migrate).to.equal(undefined);
		for (const name of ["report", "rewrap", "canaryCapture", "canaryCheck", "canaryTransit", "fetchCheck", "formatText", "exitCode"]) {
			expect(typeof mig[name], name).to.equal("function");
		}
	});

	it("(X1c) --help names no retired mode as runnable and exits 0", function () {
		const r = runCli(["--help"]);
		expect(r.status).to.equal(0);
		expect(r.stdout).to.include("--report");
		expect(r.stdout).to.include("--rewrap");
		expect(r.stdout).to.include("retired");
	}, 30000);

	it("(X2) --report counts legacy files by first-line kind and changes no file", async function () {
		const { fx } = await threeKindDir();
		const before = snapshot(fx.dir);
		const rep = mig.report(envFor(fx, new FakeTransit()));
		expect(rep.mode).to.equal("report");
		expect(rep.private_files).to.equal(3);
		expect(rep.legacy_total).to.equal(1);
		expect(rep.legacy).to.deep.equal({ encrypted_pkcs8: 1, pkcs1: 0, openssh: 0, other: 0 });
		expect(rep.transit_total).to.equal(1);
		expect(rep.transit).to.deep.equal({ v1: 1 });
		expect(rep.unknown).to.equal(1);
		expect(rep.unreadable).to.equal(0);
		expect(mig.exitCode(rep)).to.equal(0);
		expect(snapshot(fx.dir)).to.deep.equal(before);
		expect(mig.formatText(rep)).to.match(/^\[migrate-deploy-keys\] mode +: report$/m);
	});

	it("(X3) --rewrap rewraps only below-latest Transit files and counts the legacy file without parsing or changing it", async function () {
		const { fx, t, legacy, transit, unknownName } = await threeKindDir();
		const untouched = [legacy.name, legacy.name + ".pub", unknownName];
		const before = snapshot(fx.dir).filter((s) => untouched.includes(s.name));
		t.rotate();
		const parse = spyOn(crypto, "createPrivateKey").and.callThrough();
		const rep = await mig.rewrap(envFor(fx, t));
		expect(parse.calls.count()).to.equal(0);
		expect(rep.rewrapped).to.equal(1);
		expect(rep.failed).to.equal(0);
		expect(rep.legacy_total).to.equal(1);
		expect(rep.legacy.encrypted_pkcs8).to.equal(1);
		expect(rep.versions_after).to.deep.equal({ v2: 1 });
		expect(t.calls.rewrap).to.equal(1);
		expect(fs.readFileSync(path.join(fx.dir, transit.name), "utf8")).to.match(/^vault:v2:/);
		expect(snapshot(fx.dir).filter((s) => untouched.includes(s.name))).to.deep.equal(before);
	});

	it("(X4) no report or rewrap output, text or JSON, carries a PEM, ciphertext, key body or a path", async function () {
		const { fx, t, legacy } = await threeKindDir();
		t.rotate();
		const env = envFor(fx, t);
		const bodyRun = legacy.pem.split("\n")[1].slice(0, 40);
		const reports = [mig.report(env), await mig.rewrap(env), await mig.rewrap(env)];
		const down = fixture();
		await writeTransit(down.dir, OWNER, 1700000004101, new FakeTransit());
		reports.push(await mig.rewrap(envFor(down, new FakeTransit({ failReason: "sealed" }))));
		for (const r of reports) {
			for (const out of [mig.formatText(r), JSON.stringify(r)]) {
				for (const banned of ["PRIVATE KEY", "vault:v", PASSPHRASE, bodyRun, fx.dir, down.dir, os.tmpdir()]) {
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

	it("(W4d) a writing rewrap removes its own leftover temps and no other dot-file", async function () {
		const { fx, t } = await rewrapDir();
		t.rotate();
		const name = OWNER + "-1700000003001";
		const leftover = "." + name + ".0123456789ab.keymig.tmp";
		const others = ["." + name + ".0123456789ab.keymig.tmp.bak", "." + name + ".pub.0123456789ab.tmp", "." + name + ".xyz.keymig.tmp"];
		for (const n of [leftover].concat(others)) fs.writeFileSync(path.join(fx.dir, n), "x", { mode: 0o600 });
		const env = envFor(fx, t);
		expect(mig.report(env).leftover_tmp).to.equal(1);
		await mig.rewrap(env);
		expect(fs.existsSync(path.join(fx.dir, leftover))).to.equal(false);
		for (const n of others) expect(fs.existsSync(path.join(fx.dir, n)), n).to.equal(true);
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

	function makeTransit() {
		const sent = [];
		return new Transit({ slackNotify: () => ({ send: (p) => { sent.push(p); return Promise.resolve(); } }), webhook: null });
	}

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
