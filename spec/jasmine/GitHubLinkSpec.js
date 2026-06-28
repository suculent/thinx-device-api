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

});
