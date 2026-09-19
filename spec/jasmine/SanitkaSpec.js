describe("Sanitka", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running Sanitka spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Sanitka spec`);
  });

  var expect = require('chai').expect;
  var Sanitka = require('../../lib/thinx/sanitka'); var sanitka = new Sanitka();

  it("should sanitize URLs", function () {
    var s = sanitka.url("https://github.com/suculent/thinx-device-api/ && ");
    expect(s).to.equal(null);
  });

  it("should sanitize branches (invalid &)", function () {
    var s = sanitka.url("origin/master&");
    expect(s).to.equal(null);
  });

  // Both values end up inside a shell command string built in sources.js /
  // devices.js / builder.js and executed by git.js (exec.execSync). The
  // sanitizers are allowlists; a backtick, $(...), ;, |, newline or a space
  // must never pass. See also scripts/test-shell-safety.js, which additionally
  // executes the built commands.
  const SHELL_PAYLOADS = {
    "backtick": "`touch /tmp/pwned`",
    "command substitution": "$(touch /tmp/pwned)",
    "semicolon": "; touch /tmp/pwned",
    "pipe": "| touch /tmp/pwned",
    "newline": "\ntouch /tmp/pwned",
    "space": " touch /tmp/pwned",
    "ampersand": "&& touch /tmp/pwned",
    "single quote": "'; touch /tmp/pwned; '",
    "double quote": "\"; touch /tmp/pwned; \""
  };

  Object.keys(SHELL_PAYLOADS).forEach(function (label) {
    let payload = SHELL_PAYLOADS[label];

    it("should reject branch containing " + label, function () {
      expect(sanitka.branch("main" + payload)).to.equal(null);
      expect(sanitka.branch(payload)).to.equal(null);
    });

    it("should reject URL containing " + label, function () {
      expect(sanitka.url("https://github.com/suculent/thinx-device-api.git" + payload)).to.equal(null);
      expect(sanitka.url("git@github.com:suculent/thinx-device-api.git" + payload)).to.equal(null);
    });
  });

  it("should reject branch starting with a dash (git argument injection)", function () {
    expect(sanitka.branch("--upload-pack=touch /tmp/pwned")).to.equal(null);
  });

  it("should reject branch with path traversal, trailing slash, .lock or @{", function () {
    expect(sanitka.branch("feature/../../etc")).to.equal(null);
    expect(sanitka.branch("main/")).to.equal(null);
    expect(sanitka.branch("main.lock")).to.equal(null);
    expect(sanitka.branch("main@{1}")).to.equal(null);
  });

  it("should default to main for undefined and null branch", function () {
    expect(sanitka.branch(undefined)).to.equal("main");
    expect(sanitka.branch(null)).to.equal("main");
  });

  it("should strip a leading origin/ from a valid branch", function () {
    expect(sanitka.branch("origin/master")).to.equal("master");
    expect(sanitka.branch("origin/main")).to.equal("main");
  });

  it("should accept valid branch names unchanged", function () {
    expect(sanitka.branch("main")).to.equal("main");
    expect(sanitka.branch("feature/THX-123_new-thing")).to.equal("feature/THX-123_new-thing");
    expect(sanitka.branch("v1.0.0")).to.equal("v1.0.0");
  });

  it("should accept valid git URLs and return them unchanged", function () {
    let urls = [
      "https://github.com/suculent/thinx-device-api.git",
      "http://example.com/repo.git",
      "https://user:token@github.com/suculent/private.git",
      "ssh://git@github.com:22/suculent/thinx-device-api.git",
      "git://example.com/repo.git",
      "git@github.com:suculent/thinx-device-api.git"
    ];
    urls.forEach(function (url) {
      expect(sanitka.url(url)).to.equal(url);
    });
  });

  it("should reject URLs without an accepted scheme", function () {
    expect(sanitka.url("file:///etc/passwd")).to.equal(null);
    expect(sanitka.url("ext::sh -c touch% /tmp/pwned")).to.equal(null);
    expect(sanitka.url("github.com/suculent/thinx-device-api.git")).to.equal(null);
  });

  it("should de-escape (delete) dangerous shell characters \", \', ;", function () {
    var s = sanitka.deescape("\"\';;;\"");
    expect(s).to.equal(null);
  });

  it("should accept valid owner", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.owner(input);
    expect(result).to.equal(input);
  });

  it("should reject invalid owner length", function () {
    var result = sanitka.owner("invalid-owner");
    expect(result).to.equal(null);
  });

  it("should reject invalid udid character", function () {
    var result = sanitka.udid("d6ff2bb0-df34-11e7-b351-eb37822aa17z");
    expect(result).to.equal(null);
  });

  it("should fail safely on explicit undefined token", function () {
    let input = undefined;
    var result = sanitka.pushToken(input);
    expect(result).to.equal(null);
  });

  it("should fail safely on undefined owner", function () {
    let input = undefined;
    var result = sanitka.owner(input);
    expect(result).to.equal(null);
  });

  it("should fail safely on null token", function () {
    let input = null;
    var result = sanitka.pushToken(input);
    expect(result).to.equal(null);
  });

  it("should fail safely on implicit undefined token", function () {
    let input;
    var result = sanitka.pushToken(input);
    expect(result).to.equal(null);
  });

  it("should accept valid iOS push token", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.pushToken(input);
    expect(result).to.equal(input);
  });

  it("should accept valid GCM push token", function () {
    let input = "akO1-XdQYgk:APA91bHmgm_K500RVhexcxFVoczhp5RuMSKC07kOJB7T31xq2_a9tkUAFVGQNwtZ2JORj79lDRI0ow-nP17y82GD1zTWJTEnyjNMas_qNUKxBot1P-vM6v-BW7sqcISak8sXMK91WfmH";
    var result = sanitka.pushToken(input);
    expect(result).to.equal(input);
  });

  it("should reject invalid iOS push token", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823'";
    var result = sanitka.pushToken(input);
    expect(result).to.equal(null);
  });

  it("should reject invalid GCM push token", function () {
    let input = "akO1'XdQYgk!APA91bHmgm_K500RVhexcxFVoczhp5RuMSKC07kOJB7T31xq2_a9tkUAFVGQNwtZ2JORj79lDRI0ow-nP17y82GD1zTWJTEnyjNMas_qNUKxBot1P-vM6v-BW7sqcISak8sXMK91WfmH";
    var result = sanitka.pushToken(input);
    expect(result).to.equal(null);
  });

  it("should accept valid API Key", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.apiKey(input);
    expect(result).to.equal(input);
  });

  it("should reject invalid API Key", function () {
    let input = "'31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.apiKey(input);
    expect(result).to.equal(null);
  });

  it("should accept valid username", function () {
    let input = "cimrman";
    var result = sanitka.username(input);
    expect(result).to.equal(input);
  });

  it("should reject invalid username", function () {
    let input = "@test";
    var result = sanitka.username(input);
    expect(result).to.equal(null);
  });

  it("should reject invalid udid", function () {
    let input = "@blamage";
    var result = sanitka.udid(input);
    expect(result).to.equal(null);
  });

});
