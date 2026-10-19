// Unit tests for per-user GitHub token linking (#392 / GH-01 + GH-02).
// GitHubLink.link takes injected collaborators, so these run with no live
// GitHub / CouchDB / filesystem — and stay immune to GitHubSpec flakiness.

const expect = require('chai').expect;
const GitHubLink = require("../../lib/thinx/github_link");

const OWNER = "c".repeat(64);
const TOKEN = "ghp_validtoken";

// Builds injectable deps with recording, plus per-scenario overrides.
function makeDeps(overrides) {
  overrides = overrides || {};
  const calls = { stored: null, validated: null, created: false, pushed: null };
  return {
    calls,
    deps: {
      GitHub: {
        validateAccessToken: (token, cb) => { calls.validated = token; cb(overrides.tokenValid !== false, overrides.accountKeys || []); },
        addPublicKey: (token, key, cb) => {
          calls.pushed = key;
          (calls.pushes = calls.pushes || []).push(key);
          if (overrides.pushByKey) {
            const outcome = overrides.pushByKey(key);
            return outcome === "created" ? cb(true, { status: 201, result: "created" }) : cb(false, outcome);
          }
          if (overrides.pushOutcome) return cb(false, overrides.pushOutcome);
          cb(overrides.pushOk !== false, { status: overrides.pushOk === false ? 500 : 201 });
        }
      },
      rsakey: {
        list: (owner, cb) => cb(true, overrides.existingKeys || []),
        create: (owner, cb) => {
          calls.created = true;
          // Phase 40 D-03: the refusal rsakey.create() gives when OpenBao is unavailable
          // or THINX_DEPLOY_KEYGEN is off.
          if (overrides.createUnavailable) return cb(false, "key_service_unavailable");
          cb(overrides.createOk !== false, overrides.createOk === false ? null : { pubkey: "ssh-rsa NEWKEY" });
        }
      },
      user: {
        addGitHubAccessToken: (owner, token, cb) => { calls.stored = token; cb(overrides.storeOk !== false); }
      }
    }
  };
}

describe("GitHubLink.link", function () {

  // Phase 40 D-03 / KEYENC-03: the key service refusal is a 503 with the fixed code, not a 500.
  it("answers 503 key_service_unavailable when the key create is refused and pushes nothing (D-03)", function (done) {
    const { calls, deps } = makeDeps({ createUnavailable: true });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r).to.deep.equal({ status: 503, success: false, response: "key_service_unavailable" });
      expect(calls.created).to.equal(true);
      expect(calls.pushed).to.equal(null);
      done();
    });
  });

  it("keeps 500 rsa_key_creation_failed for any other create failure and pushes nothing", function (done) {
    const { calls, deps } = makeDeps({ createOk: false });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r).to.deep.equal({ status: 500, success: false, response: "rsa_key_creation_failed" });
      expect(calls.pushed).to.equal(null);
      done();
    });
  });

  it("answers 503 key_service_unavailable when every existing key is in use elsewhere and the create is refused", function (done) {
    const { calls, deps } = makeDeps({
      createUnavailable: true,
      existingKeys: [{ pubkey: "ssh-rsa TAKEN", fingerprint: "SHA256:t" }],
      pushByKey: () => ({ status: 422, result: "already_in_use" })
    });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r).to.deep.equal({ status: 503, success: false, response: "key_service_unavailable" });
      expect(calls.pushes).to.deep.equal(["ssh-rsa TAKEN"], "only the existing key was pushed");
      done();
    });
  });

  it("answers 403 github_token_missing_scope when GitHub refuses the key list (403) and stores nothing", function (done) {
    const { calls, deps } = makeDeps({ tokenValid: false, accountKeys: { status: 403 } });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(403);
      expect(r.success).to.equal(false);
      expect(r.response).to.equal("github_token_missing_scope");
      expect(calls.stored).to.equal(null);
      expect(calls.pushed).to.equal(null);
      done();
    });
  });

  it("keeps 401 github_token_invalid for a 401 from GitHub", function (done) {
    const { deps } = makeDeps({ tokenValid: false, accountKeys: { status: 401 } });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(401);
      expect(r.response).to.equal("github_token_invalid");
      done();
    });
  });

  it("rejects an invalid token with 401 and stores nothing (GH-01)", function (done) {
    const { calls, deps } = makeDeps({ tokenValid: false });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(401);
      expect(r.success).to.equal(false);
      expect(r.response).to.equal("github_token_invalid");
      expect(calls.stored).to.equal(null);   // nothing persisted
      expect(calls.pushed).to.equal(null);    // no key pushed
      done();
    });
  });

  it("stores a valid token and pushes an existing key (GH-01 + GH-02)", function (done) {
    const { calls, deps } = makeDeps({ existingKeys: [{ pubkey: "ssh-rsa EXISTING", fingerprint: "SHA256:e" }] });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(200);
      expect(r.success).to.equal(true);
      expect(calls.stored).to.equal(TOKEN);
      expect(calls.created).to.equal(false);          // had a key already
      expect(calls.pushed).to.equal("ssh-rsa EXISTING");
      expect(r.response.created_key).to.equal(false);
      expect(r.response.key_pushed).to.equal(true);
      done();
    });
  });

  it("auto-creates an RSA key when the user has none, then pushes it (GH-02)", function (done) {
    const { calls, deps } = makeDeps({ existingKeys: [] });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(200);
      expect(calls.created).to.equal(true);
      expect(calls.pushed).to.equal("ssh-rsa NEWKEY");
      expect(r.response.created_key).to.equal(true);
      done();
    });
  });

  it("returns 400 when no token is supplied", function (done) {
    const { deps } = makeDeps({});
    GitHubLink.link(deps, OWNER, undefined, (r) => {
      expect(r.status).to.equal(400);
      expect(r.response).to.equal("missing_token");
      done();
    });
  });

  it("never includes the token in the response payload", function (done) {
    const { deps } = makeDeps({ existingKeys: [{ pubkey: "ssh-rsa EXISTING", fingerprint: "SHA256:e" }] });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(JSON.stringify(r)).to.not.contain(TOKEN);
      done();
    });
  });

  // Phase 45 D-13 (38 IN-07): list() is newest first, so pushing list[0] made the
  // newest key (often a repository-specific one) the account-wide GitHub key.
  // Linking now pushes the OLDEST key by the millisecond timestamp in its filename,
  // whatever order list() returns.
  const NEW = { filename: OWNER + "-3000", pubkey: "ssh-rsa NEW", fingerprint: "SHA256:new" };
  const OLD = { filename: OWNER + "-1000", pubkey: "ssh-rsa OLD", fingerprint: "SHA256:old" };
  const MID = { filename: OWNER + "-2000", pubkey: "ssh-rsa MID", fingerprint: "SHA256:mid" };

  function expectPush(existingKeys, expected, done) {
    const { calls, deps } = makeDeps({ existingKeys: existingKeys });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(200);
      expect(calls.created).to.equal(false);
      expect(calls.pushed).to.equal(expected);
      expect(r.response).to.deep.equal({ key_pushed: true, created_key: false, keys_in_use_elsewhere: 0 });
      done();
    });
  }

  it("G1 pushes the oldest key from a newest-first list (D-13, IN-07)", function (done) {
    expectPush([NEW, OLD, MID], "ssh-rsa OLD", done);
  });

  it("G2 pushes the oldest key whatever the list order (D-13)", function (done) {
    // G1's list reversed, then shuffled with the oldest key last.
    expectPush([NEW, OLD, MID].reverse(), "ssh-rsa OLD", () => {
      expectPush([MID, NEW, OLD], "ssh-rsa OLD", done);
    });
  });

  it("G3 skips the oldest key when it has no pubkey (D-13)", function (done) {
    expectPush([NEW, { filename: OLD.filename, pubkey: "", fingerprint: "SHA256:old" }, MID], "ssh-rsa MID", done);
  });

  it("G4 picks an untimestamped key only when no timestamped key has a pubkey; first in list order wins", function (done) {
    const noName = { pubkey: "ssh-rsa NONAME", fingerprint: "SHA256:n" };
    const badTs = { filename: OWNER + "-abc", pubkey: "ssh-rsa BADTS", fingerprint: "SHA256:b" };
    const nonString = { filename: 42, pubkey: "ssh-rsa NONSTRING", fingerprint: "SHA256:s" };
    expectPush([noName, badTs, NEW], "ssh-rsa NEW", () => {
      expectPush([badTs, noName, { filename: OLD.filename, pubkey: null, fingerprint: "SHA256:old" }], "ssh-rsa BADTS", () => {
        expectPush([nonString, badTs], "ssh-rsa NONSTRING", done);
      });
    });
  });

  function expectCreate(overrides, done) {
    const { calls, deps } = makeDeps(overrides);
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(200);
      expect(calls.created).to.equal(true);
      expect(calls.pushed).to.equal("ssh-rsa NEWKEY");
      expect(r.response).to.deep.equal({ key_pushed: true, created_key: true, keys_in_use_elsewhere: 0 });
      done();
    });
  }

  it("G5 creates and pushes a key when no listed key has a pubkey, the list is empty, or list() fails", function (done) {
    expectCreate({ existingKeys: [{ filename: OLD.filename, pubkey: "" }, { filename: NEW.filename }] }, () => {
      expectCreate({ existingKeys: [] }, () => {
        const { calls, deps } = makeDeps({ existingKeys: [OLD] });
        deps.rsakey.list = (owner, cb) => cb(false, [OLD]);
        GitHubLink.link(deps, OWNER, TOKEN, (r) => {
          expect(r.status).to.equal(200);
          expect(calls.created).to.equal(true);
          expect(calls.pushed).to.equal("ssh-rsa NEWKEY");
          expect(r.response).to.deep.equal({ key_pushed: true, created_key: true, keys_in_use_elsewhere: 0 });
          done();
        });
      });
    });
  });

  // 45-REVIEW WR-01: list() keeps an unparseable (often PEM-era) .pub "as stored" with
  // fingerprint null. D-13 must never pin such a key as the account key, and a push that
  // GitHub refused must never be reported as key_pushed: true.
  const DAMAGED = { filename: OWNER + "-500", pubkey: "-----BEGIN PUBLIC KEY-----\nGARBAGE", fingerprint: null };

  it("W1 skips an older key without a fingerprint and pushes the oldest fingerprinted one", function (done) {
    expectPush([NEW, DAMAGED, MID, { filename: OWNER + "-1", pubkey: "ssh-rsa X", fingerprint: "" }], "ssh-rsa MID", done);
  });

  it("W2 creates and pushes a new key when every listed key is damaged", function (done) {
    expectCreate({ existingKeys: [DAMAGED, { filename: OLD.filename, pubkey: "ssh-rsa OLD" }] }, done);
  });

  function expectLinked(overrides, keyPushed, done) {
    const { calls, deps } = makeDeps(Object.assign({ existingKeys: [OLD] }, overrides));
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(200);
      expect(calls.pushed).to.equal("ssh-rsa OLD");
      expect(r.response).to.deep.equal({ key_pushed: keyPushed, created_key: false, keys_in_use_elsewhere: 0 });
      done();
    });
  }

  it("W3 reports key_pushed false when GitHub refuses the key (422 invalid, 401, 5xx)", function (done) {
    expectLinked({ pushOutcome: { status: 422, result: "rejected" } }, false, () => {
      expectLinked({ pushOutcome: { status: 401, result: "rejected" } }, false, () => {
        expectLinked({ pushOk: false }, false, done);
      });
    });
  });

  it("W4 'key is already in use' counts as pushed when the key is on this account", function (done) {
    const inUse = { status: 422, result: "already_in_use" };
    expectLinked({ pushOutcome: inUse, accountKeys: [{ id: 1, key: "ssh-rsa OTHER" }, { id: 2, key: "ssh-rsa OLD" }] }, true, done);
  });

  const IN_USE = { status: 422, result: "already_in_use" };

  it("W5 a key in use elsewhere is skipped and the next-oldest key is pushed", function (done) {
    const { calls, deps } = makeDeps({
      existingKeys: [NEW, MID, OLD],
      accountKeys: [],
      pushByKey: (key) => (key === "ssh-rsa OLD" ? IN_USE : "created")
    });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(calls.pushes).to.deep.equal(["ssh-rsa OLD", "ssh-rsa MID"]);
      expect(calls.created).to.equal(false);
      expect(r.response).to.deep.equal({ key_pushed: true, created_key: false, keys_in_use_elsewhere: 1 });
      done();
    });
  });

  it("W6 when every key is in use elsewhere a fresh key is created and pushed", function (done) {
    const { calls, deps } = makeDeps({
      existingKeys: [NEW, OLD],
      accountKeys: "not a list",
      pushByKey: (key) => (key === "ssh-rsa NEWKEY" ? "created" : IN_USE)
    });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(calls.pushes).to.deep.equal(["ssh-rsa OLD", "ssh-rsa NEW", "ssh-rsa NEWKEY"]);
      expect(calls.created).to.equal(true);
      expect(r.response).to.deep.equal({ key_pushed: true, created_key: true, keys_in_use_elsewhere: 2 });
      done();
    });
  });

  it("W7 any other refusal stops at once, without trying more keys or creating one", function (done) {
    const { calls, deps } = makeDeps({
      existingKeys: [NEW, OLD],
      pushByKey: () => ({ status: 422, result: "rejected" })
    });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(calls.pushes).to.deep.equal(["ssh-rsa OLD"]);
      expect(calls.created).to.equal(false);
      expect(r.response).to.deep.equal({ key_pushed: false, created_key: false, keys_in_use_elsewhere: 0 });
      done();
    });
  });

  it("W8 the fresh key is reported not pushed when GitHub also refuses it", function (done) {
    const { calls, deps } = makeDeps({ existingKeys: [OLD], accountKeys: [], pushByKey: () => IN_USE });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(calls.pushes).to.deep.equal(["ssh-rsa OLD", "ssh-rsa NEWKEY"]);
      expect(r.response).to.deep.equal({ key_pushed: false, created_key: true, keys_in_use_elsewhere: 1 });
      done();
    });
  });
});
