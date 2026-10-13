/*
 * Git.failureCause maps git's stderr from a failed clone to a fixed cause code, the only
 * part of stderr the API logs (debugging private-repository source adds).
 */
const expect = require('chai').expect;
const Git = require("../../lib/thinx/git.js");

describe("Git clone failure cause", function () {

  it("maps known git errors to fixed codes", function () {
    const cases = [
      ["git@github.com: Permission denied (publickey).\r\nfatal: Could not read from remote repository.", "publickey_denied"],
      ["ERROR: Repository not found.\nfatal: Could not read from remote repository.", "repo_not_found_or_no_access"],
      ["Host key verification failed.", "host_key_failed"],
      ["warning: Could not find remote branch master to clone.\nfatal: Remote branch master not found in upstream origin", "branch_not_found"],
      ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", "https_auth_required"],
      ["ssh: Could not resolve hostname github.com: Name or service not known", "network"],
      ["ssh: connect to host github.com port 22: Connection timed out", "network"],
      ["Load key \"/tmp/k\": invalid format", "key_unusable"],
      ["something else entirely", "other"],
      ["", "no_stderr"],
      [undefined, "no_stderr"]
    ];
    for (const [stderr, code] of cases) {
      expect(Git.failureCause(stderr), JSON.stringify(stderr)).to.equal(code);
    }
  });
});
