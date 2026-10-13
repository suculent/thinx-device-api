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

function fakeResponse(status, body) {
  const res = new EventEmitter();
  res.statusCode = status;
  // Response headers can carry request data too (a redirect location, a request id).
  res.headers = { "x-github-request-id": "ABCD", "x-echo": "Bearer " + TOKEN };
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
    req.end = () => {
      process.nextTick(() => {
        if (reply.error) req.emit("error", reply.error);
        else callback(fakeResponse(reply.status, reply.body));
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
    expect(got.outcome).to.deep.equal({ status: reply.status, result: result });
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
