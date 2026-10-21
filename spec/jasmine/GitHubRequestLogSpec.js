// 45-REVIEW CR-01: lib/thinx/github.js logged the request options, so every GitHub link
// wrote `Authorization: Bearer <token>` to the API service log. These specs drive both
// GitHub calls against a stubbed node:https (no network) with a fake token, capture every
// console method, and assert that nothing logged carries the token, a bearer header or a
// response body. Only method, path and status may be logged.

const expect = require('chai').expect;
const https = require("node:https");
const { EventEmitter } = require("node:events");
const GitHub = require("../../lib/thinx/github");

const TOKEN = "ghp_FAKE" + "0123456789abcdefCR01leak";
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug", "trace", "dir"];

// Records every console call as one string until restore().
function captureConsole() {
  const saved = {};
  const lines = [];
  for (const m of CONSOLE_METHODS) {
    saved[m] = console[m];
    console[m] = (...args) => {
      lines.push(args.map((a) => {
        if (typeof a === "string") return a;
        try { return require("node:util").inspect(a, { depth: 10 }); } catch { return String(a); }
      }).join(" "));
    };
  }
  return {
    text: () => lines.join("\n"),
    restore: () => { for (const m of CONSOLE_METHODS) console[m] = saved[m]; }
  };
}

function fakeResponse(status, body, headers) {
  const res = new EventEmitter();
  res.statusCode = status;
  // Response headers can carry request data too (a redirect location, a request id).
  res.headers = Object.assign({ "x-github-request-id": "ABCD", "x-echo": "Bearer " + TOKEN }, headers || {});
  process.nextTick(() => {
    if (body !== null) res.emit("data", Buffer.from(body));
    res.emit("end");
  });
  return res;
}

// Replaces https.request / https.get; `reply` is { status, body } or { error }.
function stubHttps(method, reply) {
  const original = https[method];
  const sent = { options: null, body: "" };
  https[method] = function (first, second, third) {
    const callback = typeof third === "function" ? third : second;
    sent.options = typeof first === "string" ? second : first;
    const req = new EventEmitter();
    req.write = (chunk) => { sent.body += chunk; };
    req.setTimeout = () => req;
    req.end = () => {
      process.nextTick(() => {
        if (reply.error) req.emit("error", reply.error);
        else callback(fakeResponse(reply.status, reply.body, reply.headers));
      });
    };
    if (method === "get") req.end();
    return req;
  };
  return { sent, restore: () => { https[method] = original; } };
}

// The body GitHub would answer, made hostile: it echoes the token and the key.
const echoBody = (extra) => JSON.stringify(Object.assign({
  message: "echo Bearer " + TOKEN,
  documentation_url: "https://docs.github.com/rest"
}, extra || {}));

function expectClean(text) {
  expect(text).to.not.contain(TOKEN);
  expect(text.toLowerCase()).to.not.contain("bearer");
  expect(text.toLowerCase()).to.not.contain("authorization");
  expect(text).to.not.contain("ssh-rsa AAAAB3CR01");
}

describe("GitHub request logging (45-REVIEW CR-01)", function () {

  const cases = [
    ["a created key (201)", { status: 201, body: echoBody({ id: 1, key: "ssh-rsa AAAAB3CR01" }) }],
    ["a key already in use (422)", { status: 422, body: echoBody({ errors: [{ message: "key is already in use" }] }) }],
    ["an invalid key (422)", { status: 422, body: echoBody({ errors: [{ message: "key is invalid" }] }) }],
    ["bad credentials (401)", { status: 401, body: echoBody() }],
    ["a non-JSON body (502)", { status: 502, body: "<html>Bearer " + TOKEN + "</html>" }],
    ["a transport error", { error: Object.assign(new Error("connect ECONNREFUSED Bearer " + TOKEN), { code: "ECONNREFUSED" }) }]
  ];

  for (const [label, reply] of cases) {
    it("addPublicKey never logs the token, headers or bodies on " + label, function (done) {
      const stub = stubHttps("request", reply);
      const out = captureConsole();
      GitHub.addPublicKey(TOKEN, "ssh-rsa AAAAB3CR01 thinx", () => {
        setImmediate(() => {
          out.restore();
          stub.restore();
          try {
            // The header still goes to GitHub; it just never reaches the log.
            expect(stub.sent.options.headers.Authorization).to.equal("Bearer " + TOKEN);
            expectClean(out.text());
            if (!reply.error) expect(out.text()).to.contain("[github] POST /user/keys " + reply.status);
            done();
          } catch (e) { done.fail(e); }
        });
      });
    });

    it("validateAccessToken never logs the token, headers or bodies on " + label, function (done) {
      const stub = stubHttps("get", reply.status === 201 ? { status: 200, body: "[]" } : reply);
      const out = captureConsole();
      GitHub.validateAccessToken(TOKEN, () => {
        setImmediate(() => {
          out.restore();
          stub.restore();
          try {
            expect(stub.sent.options.headers.Authorization).to.equal("Bearer " + TOKEN);
            expectClean(out.text());
            done();
          } catch (e) { done.fail(e); }
        });
      });
    });
  }
});

// 45-REVIEW WR-01: every 422 used to count as a push, and the "already in use" test read
// `errors.message` although GitHub sends `errors` as an array. Only 201 is a push; a 422
// whose errors[].message is "key is already in use" is reported as such, so the caller
// can check the account's own key list before calling it pushed.
describe("GitHub.addPublicKey outcome (45-REVIEW WR-01)", function () {

  // Resolves with what addPublicKey reported for one stubbed GitHub answer.
  function outcomeOf(reply) {
    return new Promise((resolve) => {
      const stub = stubHttps("request", reply);
      const out = captureConsole();
      GitHub.addPublicKey(TOKEN, "ssh-rsa AAAAB3CR01 thinx", (pushed, outcome) => {
        out.restore();
        stub.restore();
        resolve({ pushed: pushed, outcome: outcome });
      });
    });
  }

  async function expectOutcome(reply, ok, result) {
    const got = await outcomeOf(reply);
    expect(got.pushed).to.equal(ok);
    expect(got.outcome).to.deep.equal(Object.assign({ status: reply.status, result: result },
      reply.status === 201 ? { key_id: 7 } : {}));
  }

  const inUse = (message) => JSON.stringify({ message: "Validation Failed", errors: [{ resource: "PublicKey", code: "custom", field: "key", message: message }] });

  it("201 is a push", async function () {
    await expectOutcome({ status: 201, body: JSON.stringify({ id: 7, key: "ssh-rsa AAAAB3CR01" }) }, true, "created");
  });

  it("422 'key is already in use' is reported as already_in_use, not as a push", async function () {
    await expectOutcome({ status: 422, body: inUse("key is already in use") }, false, "already_in_use");
    await expectOutcome({ status: 422, body: inUse("Key is already in use ") }, false, "already_in_use");
  });

  it("any other 422, 4xx, 5xx, 200 or non-JSON answer is rejected", async function () {
    await expectOutcome({ status: 422, body: inUse("key is invalid. You must supply a key in OpenSSH public key format") }, false, "rejected");
    // `errors` as an object (what the old check read) is not GitHub's shape.
    await expectOutcome({ status: 422, body: JSON.stringify({ message: "Validation Failed", errors: { message: "key is already in use" } }) }, false, "rejected");
    await expectOutcome({ status: 401, body: JSON.stringify({ message: "Bad credentials" }) }, false, "rejected");
    await expectOutcome({ status: 502, body: "<html>bad gateway</html>" }, false, "rejected");
    await expectOutcome({ status: 200, body: "{}" }, false, "rejected");
  });

  it("a transport error is reported as error", async function () {
    const got = await outcomeOf({ error: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
    expect(got.pushed).to.equal(false);
    expect(got.outcome).to.deep.equal({ status: null, result: "error" });
  });
});

describe("GitHub.deletePublicKey", function () {
  for (const status of [204, 404, 401, 403, 500]) {
    it("reports DELETE status " + status + " without leaking credentials", async function () {
      const stub = stubHttps("request", { status, body: echoBody() });
      const out = captureConsole();
      try {
        const result = await new Promise((resolve) => GitHub.deletePublicKey(TOKEN, 7, resolve));
        expect(result).to.equal(status === 204 || status === 404);
        expect(stub.sent.options.method).to.equal("DELETE");
        expect(stub.sent.options.path).to.equal("/user/keys/7");
        expect(stub.sent.options.headers.Authorization).to.equal("Bearer " + TOKEN);
        expectClean(out.text());
      } finally { out.restore(); stub.restore(); }
    });
  }

  it("reports a transport failure", async function () {
    const stub = stubHttps("request", { error: Object.assign(new Error("Bearer " + TOKEN), { code: "ECONNRESET" }) });
    const out = captureConsole();
    try {
      const result = await new Promise((resolve) => GitHub.deletePublicKey(TOKEN, 7, resolve));
      expect(result).to.equal(false);
      expectClean(out.text());
    } finally { out.restore(); stub.restore(); }
  });

  it("refuses an invalid key id without making a request", function () {
    const request = spyOn(https, "request");
    for (const id of [undefined, null, 0, -1, "7/other", NaN]) {
      let result;
      GitHub.deletePublicKey(TOKEN, id, (ok) => { result = ok; });
      expect(result).to.equal(false);
    }
    expect(request.calls.count()).to.equal(0);
  });
});

describe("GitHub rejection diagnostics (debugging the token scope error)", function () {

  function run(method, reply) {
    return new Promise((resolve) => {
      const stub = stubHttps(method === "get" ? "get" : "request", reply);
      const out = captureConsole();
      const finish = () => setImmediate(() => { out.restore(); stub.restore(); resolve(out.text()); });
      if (method === "get") GitHub.validateAccessToken(TOKEN, finish);
      else GitHub.addPublicKey(TOKEN, "ssh-rsa AAAAB3CR01 thinx", finish);
    });
  }

  it("logs the message code and the scope headers of a 403 on GET /user/keys", async function () {
    const text = await run("get", {
      status: 403,
      body: JSON.stringify({ message: "Resource not accessible by personal access token" }),
      headers: {
        "x-oauth-scopes": "repo, read:org",
        "x-accepted-oauth-scopes": "admin:public_key, read:public_key",
        "x-accepted-github-permissions": "keys=read",
        "x-github-request-id": "C0DE:1234:ABCD"
      }
    });
    expect(text).to.contain("[github] GET /user/keys 403 message=pat_lacks_permission");
    expect(text).to.contain("token_scopes=repo, read:org");
    expect(text).to.contain("accepted_scopes=admin:public_key, read:public_key");
    expect(text).to.contain("accepted_permissions=keys=read");
    expect(text).to.contain("request_id=C0DE:1234:ABCD");
    expectClean(text);
  });

  it("never logs a header or message that is not a plain scope list or known message", async function () {
    const text = await run("post", {
      status: 403,
      body: echoBody(),
      headers: {
        "x-oauth-scopes": "Bearer " + TOKEN,
        "x-accepted-oauth-scopes": TOKEN,
        "x-accepted-github-permissions": "keys=read; " + TOKEN,
        "x-github-request-id": "Bearer " + TOKEN
      }
    });
    expect(text).to.contain("[github] POST /user/keys 403 message=other errors=none token_scopes=- accepted_scopes=- accepted_permissions=- request_id=-");
    expectClean(text);
  });

  it("names the 422 reason: key in use or key invalid", async function () {
    const inUse = await run("post", { status: 422, body: JSON.stringify({ message: "Validation Failed", errors: [{ message: "key is already in use" }] }) });
    expect(inUse).to.contain("[github] POST /user/keys 422 message=validation_failed errors=key_in_use");
    const invalid = await run("post", { status: 422, body: JSON.stringify({ message: "Validation Failed", errors: [{ message: "key is invalid. You must supply a key in OpenSSH public key format" }] }) });
    expect(invalid).to.contain("errors=key_invalid");
    expectClean(inUse + invalid);
  });

  it("adds nothing for a 2xx answer", async function () {
    const text = await run("get", { status: 200, body: "[]" });
    expect(text).to.contain("[github] GET /user/keys 200");
    expect(text).to.not.contain("message=");
  });
});

