/* Unit spec for lib/thinx/transit.js against the in-process https mock in
 * spec/fixtures/mock-openbao.js (Phase 40, KEYENC-04, D-02, D-05).
 *
 * No network, no OpenBao: the mock mints its own CA at start. Every Transit
 * instance gets an injected slackNotify stub, an injected clock and a log sink.
 */

const expect = require("chai").expect;
const Transit = require("../../lib/thinx/transit.js");
const MockOpenBao = require("../fixtures/mock-openbao.js");

const ROLE = "unit-role-id";
const SECRET = "unit-secret-id";
const T0 = Date.parse("2026-10-19T08:00:00.000Z");

function harness(mock, extra) {
	const sent = [];
	const logs = [];
	const factoryCalls = { n: 0 };
	const clock = { t: T0 };
	const opts = Object.assign({
		addr: mock.addr,
		caFile: mock.caFile,
		readSecret: (name) => ({ BAO_ROLE_ID: ROLE, BAO_SECRET_ID: SECRET })[name] || null,
		now: () => clock.t,
		hostname: "unit-host",
		webhook: "https://example.invalid/hook",
		slackNotify: () => { factoryCalls.n++; return { send: (p) => { sent.push(p); return Promise.resolve(); } }; },
		log: (line) => logs.push(line)
	}, extra || {});
	return { t: new Transit(opts), sent, logs, clock, factoryCalls };
}

async function reasonOf(promise) {
	try {
		await promise;
	} catch (e) {
		expect(e).to.be.instanceOf(Transit.TransitError);
		expect(e.message).to.equal("transit_" + e.reason);
		return e.reason;
	}
	return "resolved";
}

const tick = () => new Promise((r) => setImmediate(r));

// OpenBao 2.7.1 keysutil error strings (decrypt / rewrap answer 400 {errors: [...]}).
const ERR_TOO_OLD = "ciphertext or signature version is disallowed by policy (too old)";
const ERR_KEY_NOT_FOUND = "encryption key not found";

// The rejection itself, for checks beyond the reason (op, message).
async function errorOf(promise) {
	try {
		await promise;
	} catch (e) {
		expect(e).to.be.instanceOf(Transit.TransitError);
		return e;
	}
	throw new Error("expected a rejection");
}

const answer400 = (op, errors) => (q) => (q.op === op) ? { status: 400, body: (errors === undefined) ? {} : { errors } } : undefined;

describe("Transit client (mocked OpenBao)", function () {

	let mock;

	beforeEach(async function () {
		mock = await MockOpenBao.start({ roleId: ROLE, secretId: SECRET });
	});

	afterEach(async function () {
		await mock.close();
	});

	describe("contract", function () {
		it("(C1) exposes the nine reason classes and the fixed sentences", function () {
			expect(Array.from(Transit.REASONS)).to.deep.equal(["not_configured", "unreachable", "tls", "sealed", "denied", "bad_ciphertext", "server_error", "retired_version", "key_missing"]);
			expect(Transit.unavailableSentence("retired_version")).to.equal("stored key uses a retired key version");
			expect(Transit.unavailableSentence("key_missing")).to.equal("key service has no deploy-key key");
			expect(Transit.unavailableSentence("unreachable")).to.equal("key service unreachable");
			expect(Transit.unavailableSentence("sealed")).to.equal("key service sealed");
			expect(Transit.unavailableSentence("denied")).to.equal("key service refused the request");
			expect(Transit.unavailableSentence("tls")).to.equal("key service certificate not trusted");
			expect(Transit.unavailableSentence("not_configured")).to.equal("key service not configured");
			expect(Transit.unavailableSentence("bad_ciphertext")).to.equal("stored key could not be decrypted");
			expect(Transit.unavailableSentence("server_error")).to.equal("key service error");
			expect(Transit.unavailableSentence("anything")).to.equal("key service error");
		});

		it("(C2) shared() returns one instance per process", function () {
			expect(Transit.shared()).to.equal(Transit.shared());
		});

		it("(C3) round-trips a Buffer through the mock", async function () {
			const h = harness(mock);
			const ct = await h.t.encryptKey(Buffer.from("deploy key bytes"));
			expect(ct).to.match(/^vault:v1:/);
			const out = await h.t.decryptKey(ct);
			expect(out.toString("utf8")).to.equal("deploy key bytes");
		});
	});

	describe("token lifecycle", function () {
		it("(L1) two sequential encrypts cost one login", async function () {
			const h = harness(mock);
			await h.t.encryptKey(Buffer.from("a"));
			await h.t.encryptKey(Buffer.from("b"));
			expect(mock.count("login")).to.equal(1);
			expect(mock.count("encrypt")).to.equal(2);
		});

		it("(L2) logs in again once the token is within 120 s of expiry", async function () {
			const h = harness(mock);
			await h.t.encryptKey(Buffer.from("a"));
			h.clock.t = T0 + (1200 - 120) * 1000 + 1;
			await h.t.encryptKey(Buffer.from("b"));
			expect(mock.count("login")).to.equal(2);
		});

		it("(L3) single-flight: five concurrent decrypts share one login", async function () {
			const producer = harness(mock);
			const ct = await producer.t.encryptKey(Buffer.from("shared"));
			const before = mock.count("login");
			const h = harness(mock);
			const outs = await Promise.all([1, 2, 3, 4, 5].map(() => h.t.decryptKey(ct)));
			expect(mock.count("login") - before).to.equal(1);
			for (const o of outs) expect(o.toString("utf8")).to.equal("shared");
		});

		it("(L4) never calls an auth/token endpoint", async function () {
			const h = harness(mock);
			await h.t.encryptKey(Buffer.from("a"));
			h.clock.t = T0 + 1199 * 1000;
			await h.t.encryptKey(Buffer.from("b"));
			expect(mock.requests.filter((r) => /auth\/token/.test(r.path)).length).to.equal(0);
		});
	});

	describe("D-02 retry", function () {
		it("(R1) a 403 on encrypt logs in again and retries once, then succeeds", async function () {
			mock.script(({ op, opIndex }) => (op === "encrypt" && opIndex === 0) ? { status: 403, body: { errors: [] } } : undefined);
			const h = harness(mock);
			const ct = await h.t.encryptKey(Buffer.from("a"));
			expect(ct).to.match(/^vault:v1:/);
			expect(mock.count("login")).to.equal(2);
			expect(mock.count("encrypt")).to.equal(2);
		});

		it("(R2) two 403s in a row reject denied after exactly two encrypt attempts", async function () {
			mock.script(({ op }) => op === "encrypt" ? { status: 403, body: { errors: [] } } : undefined);
			const h = harness(mock);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("denied");
			expect(mock.count("encrypt")).to.equal(2);
		});

		it("(R3) 503 is retried once, then gives sealed", async function () {
			mock.script(({ op }) => op === "encrypt" ? { status: 503, body: { errors: ["sealed"] } } : undefined);
			const h = harness(mock);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("sealed");
			expect(mock.count("encrypt")).to.equal(2);
		});

		it("(R4) a hung server rejects unreachable within 4 x requestTimeoutMs + 500 ms", async function () {
			mock.script(({ op }) => op === "encrypt" ? { hang: true } : undefined);
			const h = harness(mock, { requestTimeoutMs: 200 });
			const t0 = Date.now();
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("unreachable");
			expect(Date.now() - t0).to.be.below(4 * 200 + 500);
			expect(mock.count("encrypt")).to.equal(2);
		});
	});

	describe("no retry", function () {
		it("(N1) decrypt 400 gives bad_ciphertext after one decrypt request", async function () {
			const h = harness(mock);
			expect(await reasonOf(h.t.decryptKey("vault:v1:AAAA"))).to.equal("bad_ciphertext");
			expect(mock.count("decrypt")).to.equal(1);
		});

		it("(N2) a wrong CA gives tls after one connection", async function () {
			const h = harness(mock, { caFile: mock.otherCaFile });
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("tls");
			await tick();
			expect(mock.connections).to.equal(1);
			expect(mock.requests.length).to.equal(0);
		});

		it("(N3) an http: address gives not_configured after zero requests", async function () {
			let reads = 0;
			const h = harness(mock, { addr: mock.addr.replace(/^https:/, "http:"), readSecret: () => { reads++; return "x"; } });
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("not_configured");
			expect(mock.connections).to.equal(0);
			expect(reads).to.equal(0);
		});

		it("(N4) an unreadable CA gives not_configured after zero requests", async function () {
			const h = harness(mock, { caFile: "/nonexistent/thinx-ca.pem" });
			expect(await reasonOf(h.t.decryptKey("vault:v1:AAAA"))).to.equal("not_configured");
			expect(mock.connections).to.equal(0);
		});

		it("(N5) a login 400 gives denied without a second login", async function () {
			const h = harness(mock, { readSecret: (n) => ({ BAO_ROLE_ID: ROLE, BAO_SECRET_ID: "wrong" })[n] });
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("denied");
			expect(mock.count("login")).to.equal(1);
			expect(mock.count("encrypt")).to.equal(0);
		});

		it("(N6) a missing secret_id gives not_configured without a request", async function () {
			const h = harness(mock, { readSecret: (n) => ({ BAO_ROLE_ID: ROLE })[n] || null });
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("not_configured");
			expect(mock.connections).to.equal(0);
		});
	});

	describe("server_error", function () {
		it("(S1) a body over 64 KiB", async function () {
			mock.script(({ op }) => op === "encrypt" ? { oversize: true } : undefined);
			const h = harness(mock);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("server_error");
		});

		it("(S2) an unparsable body", async function () {
			mock.script(({ op }) => op === "encrypt" ? { status: 200, raw: "{not json" } : undefined);
			const h = harness(mock);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("server_error");
		});

		it("(S3) a 200 without data.ciphertext", async function () {
			mock.script(({ op }) => op === "encrypt" ? { status: 200, body: { data: {} } } : undefined);
			const h = harness(mock);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("server_error");
		});
	});

	describe("rewrap (Phase 41, KEYMIG-03)", function () {
		it("(W1) rewrapKey re-issues a mock ciphertext with one login and one tokened rewrap", async function () {
			const h = harness(mock);
			const ct = await h.t.encryptKey(Buffer.from("deploy key bytes"));
			const r = await h.t.rewrapKey(ct);
			expect(r.ciphertext).to.match(/^vault:v[1-9][0-9]*:/);
			expect(r.ciphertext).to.not.equal(ct);
			expect(Number.isInteger(r.version)).to.equal(true);
			expect(r.version).to.equal(1);
			expect(mock.count("login")).to.equal(1);
			expect(mock.count("rewrap")).to.equal(1);
			expect(mock.requests.filter((q) => q.op === "rewrap").every((q) => q.token === true)).to.equal(true);
			const out = await h.t.decryptKey(r.ciphertext);
			expect(out.toString()).to.equal("deploy key bytes");
			out.fill(0);
		});

		it("(W1b) the mock answers with its configured key version", async function () {
			await mock.close();
			mock = await MockOpenBao.start({ roleId: ROLE, secretId: SECRET, keyVersion: 3 });
			const h = harness(mock);
			const ct = await h.t.encryptKey(Buffer.from("x"));
			const r = await h.t.rewrapKey(ct);
			expect(r.version).to.equal(3);
			expect(r.ciphertext).to.match(/^vault:v3:/);
		});

		it("(W2) a rewrap 400 is bad_ciphertext after one rewrap request", async function () {
			const h = harness(mock);
			expect(await reasonOf(h.t.rewrapKey("vault:v1:AAAA"))).to.equal("bad_ciphertext");
			expect(mock.count("rewrap")).to.equal(1);
		});

		it("(W2b) a 403 on rewrap logs in again and retries once (D-02)", async function () {
			const h = harness(mock);
			const ct = await h.t.encryptKey(Buffer.from("x"));
			mock.script(({ op, opIndex }) => (op === "rewrap" && opIndex === 0) ? { status: 403, body: { errors: ["permission denied"] } } : undefined);
			const r = await h.t.rewrapKey(ct);
			expect(r.ciphertext).to.match(/^vault:v1:/);
			expect(mock.count("rewrap")).to.equal(2);
			expect(mock.count("login")).to.equal(2);
		});

		it("(W2c) malformed input is bad_ciphertext with no request", async function () {
			const h = harness(mock);
			for (const bad of ["garbage", "", null, 42, "vault:v0:AAAA"]) {
				expect(await reasonOf(h.t.rewrapKey(bad))).to.equal("bad_ciphertext");
			}
			expect(mock.requests.length).to.equal(0);
		});

		it("(W3) a 200 without data.ciphertext or with a non-integer key_version is server_error", async function () {
			const h = harness(mock);
			const ct = await h.t.encryptKey(Buffer.from("x"));
			mock.script(({ op }) => op === "rewrap" ? { status: 200, body: { data: { key_version: 1 } } } : undefined);
			expect(await reasonOf(h.t.rewrapKey(ct))).to.equal("server_error");
			mock.script(({ op }) => op === "rewrap" ? { status: 200, body: { data: { ciphertext: "vault:v1:QUJD", key_version: "one" } } } : undefined);
			expect(await reasonOf(h.t.rewrapKey(ct))).to.equal("server_error");
			mock.script(({ op }) => op === "rewrap" ? { status: 200, body: { data: { ciphertext: "not-a-ciphertext", key_version: 1 } } } : undefined);
			expect(await reasonOf(h.t.rewrapKey(ct))).to.equal("server_error");
			for (const line of h.logs) expect(line).to.match(/^\[transit\] (rewrap|encrypt) failed: [a-z_]+ status=[0-9]+$/);
		});
	});

	describe("D-05 incident alerts", function () {
		const FAILING = /^THiNX OpenBao: API Transit FAILING on unit-host since 2026-10-19T08:00:00\.000Z: SEALED\. One alert per incident; recovery will be announced\.$/;
		const RECOVERED = /^THiNX OpenBao: API Transit RECOVERED on unit-host; failing since 2026-10-19T08:00:00\.000Z \(SEALED\)\.$/;

		it("(A1) one FAILING per incident, then one RECOVERED naming the first reason", async function () {
			mock.script(({ op }) => op === "encrypt" ? { status: 503, body: {} } : undefined);
			const h = harness(mock);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("sealed");
			h.clock.t = T0 + 1000;
			mock.script(({ op }) => op === "encrypt" ? { status: 403, body: {} } : undefined);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("b")))).to.equal("denied");
			expect(h.sent.length).to.equal(1);
			expect(h.sent[0].text).to.match(FAILING);
			mock.script(null);
			await h.t.encryptKey(Buffer.from("c"));
			await h.t.encryptKey(Buffer.from("d"));
			expect(h.sent.length).to.equal(2);
			expect(h.sent[1].text).to.match(RECOVERED);
		});

		it("(A2) bad_ciphertext posts nothing and opens no incident", async function () {
			const h = harness(mock);
			expect(await reasonOf(h.t.decryptKey("vault:v1:AAAA"))).to.equal("bad_ciphertext");
			await h.t.encryptKey(Buffer.from("ok"));
			expect(h.sent.length).to.equal(0);
		});

		it("(A3) with the webhook unset slackNotify is never called", async function () {
			mock.script(({ op }) => op === "encrypt" ? { status: 503, body: {} } : undefined);
			const h = harness(mock, { webhook: null });
			await reasonOf(h.t.encryptKey(Buffer.from("a")));
			mock.script(null);
			await h.t.encryptKey(Buffer.from("b"));
			expect(h.factoryCalls.n).to.equal(0);
		});

		it("(A4) a rejecting send raises no unhandled rejection", async function () {
			const unhandled = [];
			const onUnhandled = (r) => unhandled.push(r);
			process.on("unhandledRejection", onUnhandled);
			try {
				mock.script(({ op }) => op === "encrypt" ? { status: 503, body: {} } : undefined);
				const h = harness(mock, { slackNotify: () => ({ send: () => Promise.reject(new Error("no_team")) }) });
				expect(await reasonOf(h.t.encryptKey(Buffer.from("a")))).to.equal("sealed");
				await tick(); await tick();
				expect(unhandled.length).to.equal(0);
			} finally {
				process.removeListener("unhandledRejection", onUnhandled);
			}
		});
	});

	describe("D-13 retired_version and key_missing (Phase 41, IN-05)", function () {
		const RETIRED = /^THiNX OpenBao: API Transit RETIRED_VERSION on unit-host at 2026-10-19T08:00:00\.000Z: a stored deploy key is below min_decryption_version and cannot be decrypted; rewrap it\. One alert per process\.$/;

		it("(D13a) a decrypt 400 carrying exactly ErrTooOld is retired_version after one request, logged by class only", async function () {
			mock.script(answer400("decrypt", [ERR_TOO_OLD]));
			const h = harness(mock);
			const e = await errorOf(h.t.decryptKey("vault:v1:AAAA"));
			expect(e.reason).to.equal("retired_version");
			expect(e.status).to.equal(400);
			expect(e.message).to.equal("transit_retired_version");
			expect(mock.count("decrypt")).to.equal(1);
			expect(h.logs).to.include("[transit] decrypt failed: retired_version status=400");
			for (const line of h.logs.concat([e.message, String(e.stack)])) expect(line.includes("too old")).to.equal(false);
		});

		it("(D13b) any other decrypt 400 stays bad_ciphertext: another error, ErrTooOld plus text, no errors array", async function () {
			for (const errors of [["invalid ciphertext"], [ERR_TOO_OLD + " extra"], ["x" + ERR_TOO_OLD], undefined]) {
				mock.script(answer400("decrypt", errors));
				const h = harness(mock);
				expect(await reasonOf(h.t.decryptKey("vault:v1:AAAA"))).to.equal("bad_ciphertext");
			}
			mock.script(({ op }) => op === "decrypt" ? { status: 400, body: { errors: ERR_TOO_OLD } } : undefined);
			expect(await reasonOf(harness(mock).t.decryptKey("vault:v1:AAAA"))).to.equal("bad_ciphertext");
		});

		it("(D13c) a rewrap 400 with ErrTooOld is retired_version; any other rewrap 400 is bad_ciphertext", async function () {
			mock.script(answer400("rewrap", [ERR_TOO_OLD]));
			const h = harness(mock);
			expect(await reasonOf(h.t.rewrapKey("vault:v1:AAAA"))).to.equal("retired_version");
			expect(mock.count("rewrap")).to.equal(1);
			expect(h.logs).to.include("[transit] rewrap failed: retired_version status=400");
			mock.script(answer400("rewrap", ["invalid ciphertext"]));
			expect(await reasonOf(harness(mock).t.rewrapKey("vault:v1:AAAA"))).to.equal("bad_ciphertext");
		});

		it("(D13d) a decrypt or rewrap 400 with 'encryption key not found' is key_missing and opens one incident", async function () {
			mock.script(answer400("decrypt", [ERR_KEY_NOT_FOUND]));
			const h = harness(mock);
			expect(await reasonOf(h.t.decryptKey("vault:v1:AAAA"))).to.equal("key_missing");
			expect(mock.count("decrypt")).to.equal(1);
			mock.script(answer400("rewrap", [ERR_KEY_NOT_FOUND]));
			expect(await reasonOf(h.t.rewrapKey("vault:v1:AAAA"))).to.equal("key_missing");
			expect(h.sent.length).to.equal(1);
			expect(h.sent[0].text).to.match(/^THiNX OpenBao: API Transit FAILING on unit-host since 2026-10-19T08:00:00\.000Z: KEY_MISSING\. /);
			mock.script(null);
			await h.t.encryptKey(Buffer.from("ok"));
			expect(h.sent.length).to.equal(2);
			expect(h.sent[1].text).to.match(/^THiNX OpenBao: API Transit RECOVERED on unit-host; failing since .* \(KEY_MISSING\)\.$/);
			for (const line of h.logs) expect(line.includes("not found")).to.equal(false);
		});

		it("(A5) retired_version alerts once per instance, never RECOVERED, and leaves outage alerts intact", async function () {
			const h = harness(mock);
			const good = await h.t.encryptKey(Buffer.from("good"));
			mock.script(answer400("decrypt", [ERR_TOO_OLD]));
			for (let i = 0; i < 3; i++) expect(await reasonOf(h.t.decryptKey("vault:v1:AAAA"))).to.equal("retired_version");
			mock.script(null);
			(await h.t.decryptKey(good)).fill(0);
			await h.t.encryptKey(Buffer.from("again"));
			expect(h.sent.length).to.equal(1);
			expect(h.sent[0].text).to.match(RETIRED);
			mock.script(({ op }) => op === "encrypt" ? { status: 503, body: {} } : undefined);
			expect(await reasonOf(h.t.encryptKey(Buffer.from("x")))).to.equal("sealed");
			expect(h.sent.length).to.equal(2);
			expect(h.sent[1].text).to.match(/FAILING on unit-host since .*: SEALED\./);

			// A retired key during an open outage incident still posts its own text, once.
			const o = harness(mock);
			expect(await reasonOf(o.t.encryptKey(Buffer.from("x")))).to.equal("sealed");
			mock.script(answer400("decrypt", [ERR_TOO_OLD]));
			expect(await reasonOf(o.t.decryptKey("vault:v1:AAAA"))).to.equal("retired_version");
			expect(await reasonOf(o.t.decryptKey("vault:v1:AAAA"))).to.equal("retired_version");
			expect(o.sent.map((p) => /FAILING/.test(p.text) ? "failing" : (RETIRED.test(p.text) ? "retired" : "other"))).to.deep.equal(["failing", "retired"]);
		});
	});

	describe("IN-10: every TransitError carries its op", function () {
		it("(IN10a) a login 500 is server_error with op login; a decrypt 500 has op decrypt; inputs carry their call's op", async function () {
			mock.script(({ op }) => op === "login" ? { status: 500, body: {} } : undefined);
			const login = await errorOf(harness(mock).t.decryptKey("vault:v1:AAAA"));
			expect(login.reason).to.equal("server_error");
			expect(login.op).to.equal("login");

			mock.script(({ op }) => op === "decrypt" ? { status: 500, body: {} } : undefined);
			const dec = await errorOf(harness(mock).t.decryptKey("vault:v1:AAAA"));
			expect(dec.reason).to.equal("server_error");
			expect(dec.op).to.equal("decrypt");

			mock.script(({ op }) => op === "login" ? { status: 503, body: {} } : undefined);
			expect((await errorOf(harness(mock).t.probe())).op).to.equal("probe");
			mock.script(null);

			const h = harness(mock);
			expect((await errorOf(h.t.encryptKey(Buffer.alloc(0)))).op).to.equal("encrypt");
			expect((await errorOf(h.t.decryptKey("garbage"))).op).to.equal("decrypt");
			expect((await errorOf(h.t.rewrapKey("garbage"))).op).to.equal("rewrap");
			expect(new Transit.TransitError("sealed", 503).op).to.equal(null);
		});
	});

	describe("boot probe", function () {
		it("(P1) probeSoon returns null under ENVIRONMENT=test and with BAO_ADDR unset", function () {
			expect(Transit.probeSoon({ env: { ENVIRONMENT: "test", BAO_ADDR: "https://x:8200" } })).to.equal(null);
			expect(Transit.probeSoon({ env: { ENVIRONMENT: "development" } })).to.equal(null);
		});

		it("(P2) an unref'd timer makes one login and logs probe ok", async function () {
			const h = harness(mock);
			const timer = Transit.probeSoon({ delayMs: 5, env: { ENVIRONMENT: "development", BAO_ADDR: mock.addr }, transit: h.t });
			expect(timer).to.not.equal(null);
			expect(timer.hasRef()).to.equal(false);
			await new Promise((r) => setTimeout(r, 300));
			expect(mock.count("login")).to.equal(1);
			expect(mock.requests.length).to.equal(1);
			expect(h.logs).to.include("[transit] probe ok");
		});

		it("(P3) a failing probe is logged and never thrown", async function () {
			mock.script(({ op }) => op === "login" ? { status: 503, body: {} } : undefined);
			const unhandled = [];
			const onUnhandled = (r) => unhandled.push(r);
			process.on("unhandledRejection", onUnhandled);
			try {
				const h = harness(mock);
				Transit.probeSoon({ delayMs: 5, env: { ENVIRONMENT: "development", BAO_ADDR: mock.addr }, transit: h.t });
				await new Promise((r) => setTimeout(r, 300));
				expect(h.logs).to.include("[transit] probe failed: sealed status=503");
				expect(mock.count("login")).to.equal(1);
				expect(unhandled.length).to.equal(0);
				expect(h.sent.length).to.equal(1);
			} finally {
				process.removeListener("unhandledRejection", onUnhandled);
			}
		});
	});
});
