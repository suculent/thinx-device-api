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

// Phase 40 Plan 02, Task 1 (KEYENC-01, KEYENC-02, KEYENC-06): a key created
// against the dev server is one vault:vN: line on disk, and a keyed fetch
// decrypts it in memory into a per-attempt ssh-agent that the attempt really
// uses, then removes it. cloneHoldingLock is spied: there is no sshd here, so
// the spy proves the agent from inside the attempt instead of cloning.
describe("Transit integration: deploy key end to end", function () {

	const fs = require("fs");
	const os = require("os");
	const path = require("path");
	const exec = require("child_process");
	const RSAKey = require("../../lib/thinx/rsakey.js");
	const Git = require("../../lib/thinx/git.js");
	const keyformat = require("../../lib/thinx/keyformat.js");

	const OWNER = "4e".repeat(32);
	const TRANSIT_LINE = /^vault:v[1-9][0-9]*:[A-Za-z0-9+/]+={0,2}\n$/;
	const lines = [];
	let origLog;
	let root;

	function agentDirs() {
		return fs.readdirSync(os.tmpdir()).filter((n) => n.indexOf("thinx-agent-") === 0);
	}

	beforeAll(function () {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-transit-e2e-"));
		origLog = console.log;
		console.log = function (...args) {
			lines.push(args.map(String).join(" "));
			return origLog.apply(console, args);
		};
	});

	afterAll(function () {
		console.log = origLog;
		if (root) fs.rmSync(root, { recursive: true, force: true });
	});

	it("(E1) stores a new key as Transit ciphertext and builds through a per-attempt agent", async function () {
		if (!guard()) return;
		const keysDir = fs.mkdtempSync(path.join(root, "keys-"));
		const t = makeTransit();
		const rsakey = new RSAKey();
		rsakey.ssh_keys = keysDir;
		rsakey.transit = t;

		const created = await new Promise((resolve) => rsakey.create(OWNER, (success, response) => resolve({ success, response }), "it-key"));
		expect(created.success).to.equal(true);
		const filename = created.response.filename;
		const privatePath = path.join(keysDir, filename);
		const publicPath = privatePath + ".pub";

		// KEYENC-01: one vault:vN: line, mode 0600, no PEM anywhere in the dir.
		const stored = fs.readFileSync(privatePath, "utf8");
		const storedCiphertext = stored.trim();
		expect(TRANSIT_LINE.test(stored)).to.equal(true);
		expect(fs.statSync(privatePath).mode & 0o777).to.equal(0o600);
		expect(keyformat.readKey(privatePath).kind).to.equal("transit");
		for (const name of fs.readdirSync(keysDir)) {
			expect(fs.readFileSync(path.join(keysDir, name), "utf8").includes("PRIVATE KEY"), name).to.equal(false);
		}
		const pubFingerprint = RSAKey.fingerprint(fs.readFileSync(publicPath, "utf8"));
		expect(pubFingerprint).to.match(/^SHA256:/);

		const seeded = path.join(root, "seeded_known_hosts");
		fs.writeFileSync(seeded, "", { mode: 0o600 });
		const git = new Git(null, {
			sshKeysDir: keysDir,
			seededKnownHosts: seeded,
			learnedKnownHostsDir: path.join(fs.mkdtempSync(path.join(root, "learned-")), "ssh_known_hosts")
		});
		git.rsa = rsakey;
		git.transit = t;

		const before = new Set(agentDirs());
		const seen = {};
		spyOn(git, "cloneHoldingLock").and.callFake(async function (buildPath, url, branch, env) {
			seen.socketDir = path.dirname(env.SSH_AUTH_SOCK);
			seen.socketDirMode = fs.statSync(seen.socketDir).mode & 0o777;
			seen.sshCommand = env.GIT_SSH_COMMAND;
			seen.forbidden = ["SSH_ASKPASS", "SSH_ASKPASS_REQUIRE", "GIT_KEY_PASSPHRASE"].filter((k) => k in env);
			// Only PATH and the attempt's socket: the agent itself must hold the key.
			const listed = exec.execFileSync("ssh-add", ["-l", "-E", "sha256"], {
				env: { PATH: process.env.PATH, SSH_AUTH_SOCK: env.SSH_AUTH_SOCK },
				encoding: "utf8"
			}).trim().split("\n").filter((l) => l.length > 0);
			seen.agentKeys = listed.length;
			seen.agentFingerprint = (listed[0] || "").split(/\s+/)[1];
			seen.pubPathFingerprint = RSAKey.fingerprint(fs.readFileSync(env.THINX_GIT_KEY_PUB, "utf8"));
			seen.agentDirEntries = fs.readdirSync(seen.socketDir).sort();
			return { ok: true, repoPath: buildPath, reason: null };
		});

		const ok = await git.fetch(OWNER, "ssh://git@example.invalid/owner/repo.git", "main", fs.mkdtempSync(path.join(root, "build-")));
		expect(ok).to.equal(true);
		expect(git.cloneHoldingLock.calls.count()).to.equal(1);

		// KEYENC-02: the agent held exactly this key, the attempt used the agent command
		// and saw no askpass helper or passphrase.
		expect(seen.agentKeys).to.equal(1);
		expect(seen.agentFingerprint).to.equal(pubFingerprint);
		expect(seen.pubPathFingerprint).to.equal(pubFingerprint);
		expect(seen.sshCommand).to.equal(Git.AGENT_SSH_COMMAND);
		expect(seen.forbidden).to.deep.equal([]);
		expect(seen.socketDirMode).to.equal(0o700);
		expect(seen.agentDirEntries).to.deep.equal(["agent.sock", "key.pub"]);

		// Cleanup: the attempt's directory is gone and no new agent dir remains.
		expect(fs.existsSync(seen.socketDir)).to.equal(false);
		expect(agentDirs().filter((n) => !before.has(n))).to.deep.equal([]);

		// Nothing printed carries the ciphertext or a PEM header.
		for (const line of lines) {
			expect(line.includes(storedCiphertext)).to.equal(false);
			expect(line.includes("PRIVATE KEY")).to.equal(false);
		}
	}, 60000);

	// WR-02: a Git over `keysDir` whose transit is `t`, with the key order `names`.
	function outageGit(keysDir, t, names) {
		const seeded = path.join(root, "seeded_known_hosts");
		fs.writeFileSync(seeded, "", { mode: 0o600 });
		const git = new Git(null, {
			sshKeysDir: keysDir,
			seededKnownHosts: seeded,
			learnedKnownHostsDir: path.join(fs.mkdtempSync(path.join(root, "learned-")), "ssh_known_hosts")
		});
		git.transit = t;
		git.keyNamesForOwner = () => names;
		return git;
	}

	function envLabel(env) {
		if (env && env.SSH_AUTH_SOCK) return "agent";
		return "keyless";
	}

	// Phase 41 (D-09): the legacy file in the same fetch is a logged skip, not an attempt.
	it("(E2) an unreachable OpenBao costs one Transit key per fetch; a legacy file is a logged skip (WR-02, D-09)", async function () {
		if (!guard()) return;
		const keysDir = fs.mkdtempSync(path.join(root, "keys-"));
		// Real ciphertexts from the dev server, read back through a dead address.
		const live = makeTransit();
		for (const name of ["t1", "t2", "t3"]) {
			const ct = await live.encryptKey(crypto.randomBytes(32));
			fs.writeFileSync(path.join(keysDir, name), ct + "\n", { mode: 0o600 });
		}
		const armor = (label) => "-----" + label + " ENCRYPTED " + "PRIVATE KEY-----";
		fs.writeFileSync(path.join(keysDir, "legacy"), armor("BEGIN") + "\nnot a real key\n" + armor("END") + "\n", { mode: 0o600 });

		const dead = makeTransit({ addr: "https://127.0.0.1:1" });
		spyOn(dead, "decryptKey").and.callThrough();
		const git = outageGit(keysDir, dead, ["t1", "t2", "t3", "legacy"]);
		const attempts = [];
		spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(envLabel(env)); return { ok: true, repoPath: b, reason: null }; });

		const r = await git.fetchDetailed(OWNER, "ssh://git@example.invalid/owner/repo.git", "main", fs.mkdtempSync(path.join(root, "build-")));
		expect(r).to.deep.equal({ ok: false, keyUnavailable: "unreachable" });
		expect(dead.decryptKey.calls.count()).to.equal(1);
		expect(attempts).to.deep.equal([]);
		for (const name of ["t2", "t3"]) {
			expect(lines).to.include(`[git] key ${name} skipped: deploy key unavailable: unreachable`);
		}
		expect(lines).to.include("[git] key legacy skipped: legacy_format_unsupported");
	}, 60000);

	it("(E3) a real bad_ciphertext key does not skip the next Transit key (WR-02)", async function () {
		if (!guard()) return;
		const keysDir = fs.mkdtempSync(path.join(root, "keys-"));
		const t = makeTransit();
		const rsakey = new RSAKey();
		rsakey.ssh_keys = keysDir;
		rsakey.transit = t;
		const created = await new Promise((resolve) => rsakey.create(OWNER, (success, response) => resolve({ success, response }), "it-key-e3"));
		expect(created.success).to.equal(true);
		fs.writeFileSync(path.join(keysDir, "bad"), "vault:v1:AAAA\n", { mode: 0o600 });

		spyOn(t, "decryptKey").and.callThrough();
		const git = outageGit(keysDir, t, ["bad", created.response.filename]);
		const attempts = [];
		spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(envLabel(env)); return { ok: true, repoPath: b, reason: null }; });

		const r = await git.fetchDetailed(OWNER, "ssh://git@example.invalid/owner/repo.git", "main", fs.mkdtempSync(path.join(root, "build-")));
		expect(r).to.deep.equal({ ok: true, keyUnavailable: null });
		expect(t.decryptKey.calls.count()).to.equal(2);
		expect(attempts).to.deep.equal(["agent"]);
		expect(lines).to.include("[git] key bad skipped: deploy key unavailable: bad_ciphertext");
	}, 60000);
});
