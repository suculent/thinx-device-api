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
        validateAccessToken: (token, cb) => { calls.validated = token; cb(overrides.tokenValid !== false); },
        addPublicKey: (token, key, cb) => { calls.pushed = key; cb(overrides.pushOk !== false); }
      },
      rsakey: {
        list: (owner, cb) => cb(true, overrides.existingKeys || []),
        create: (owner, cb) => { calls.created = true; cb(overrides.createOk !== false, overrides.createOk === false ? null : { pubkey: "ssh-rsa NEWKEY" }); }
      },
      user: {
        addGitHubAccessToken: (owner, token, cb) => { calls.stored = token; cb(overrides.storeOk !== false); }
      }
    }
  };
}

describe("GitHubLink.link", function () {

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
    const { calls, deps } = makeDeps({ existingKeys: [{ pubkey: "ssh-rsa EXISTING" }] });
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
    const { deps } = makeDeps({ existingKeys: [{ pubkey: "ssh-rsa EXISTING" }] });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(JSON.stringify(r)).to.not.contain(TOKEN);
      done();
    });
  });

  // Phase 45 D-13 (38 IN-07): list() is newest first, so pushing list[0] made the
  // newest key (often a repository-specific one) the account-wide GitHub key.
  // Linking now pushes the OLDEST key by the millisecond timestamp in its filename,
  // whatever order list() returns.
  const NEW = { filename: OWNER + "-3000", pubkey: "ssh-rsa NEW" };
  const OLD = { filename: OWNER + "-1000", pubkey: "ssh-rsa OLD" };
  const MID = { filename: OWNER + "-2000", pubkey: "ssh-rsa MID" };

  function expectPush(existingKeys, expected, done) {
    const { calls, deps } = makeDeps({ existingKeys: existingKeys });
    GitHubLink.link(deps, OWNER, TOKEN, (r) => {
      expect(r.status).to.equal(200);
      expect(calls.created).to.equal(false);
      expect(calls.pushed).to.equal(expected);
      expect(r.response).to.deep.equal({ key_pushed: true, created_key: false });
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
    expectPush([NEW, { filename: OLD.filename, pubkey: "" }, MID], "ssh-rsa MID", done);
  });

  it("G4 picks an untimestamped key only when no timestamped key has a pubkey; first in list order wins", function (done) {
    const noName = { pubkey: "ssh-rsa NONAME" };
    const badTs = { filename: OWNER + "-abc", pubkey: "ssh-rsa BADTS" };
    const nonString = { filename: 42, pubkey: "ssh-rsa NONSTRING" };
    expectPush([noName, badTs, NEW], "ssh-rsa NEW", () => {
      expectPush([badTs, noName, { filename: OLD.filename, pubkey: null }], "ssh-rsa BADTS", () => {
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
      expect(r.response).to.deep.equal({ key_pushed: true, created_key: true });
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
          expect(r.response).to.deep.equal({ key_pushed: true, created_key: true });
          done();
        });
      });
    });
  });

});
