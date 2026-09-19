// Unit tests for Docker Secrets support (#418 / SEC-CFG-01).
// readSecret() depends only on fs, so these run with no live services — fs is
// stubbed to simulate the presence/absence of /run/secrets/<name>.
//
// IMPORTANT: use ONLY throwaway secret names here. Real credential names
// (COUCHDB_USER, COUCHDB_PASS, REDIS_PASSWORD) must never be set/deleted in a
// spec — other suites build a Database/Redis client from the cached env values,
// and clearing them mid-suite breaks DB/Redis bring-up downstream.

const expect = require('chai').expect;
const fs = require('fs');
const { readSecret, _resetCacheForTests } = require("../../lib/thinx/secrets");

const FILE_NAME = "THINX_TEST_SECRET_FILE";
const ENV_NAME = "THINX_TEST_SECRET_ENV";
const ABSENT_NAME = "THINX_TEST_SECRET_ABSENT";
const CACHE_NAME = "THINX_TEST_SECRET_CACHE";

describe("secrets.readSecret", function () {

  let origExists, origRead;

  beforeEach(function () {
    origExists = fs.existsSync;
    origRead = fs.readFileSync;
    _resetCacheForTests();
  });

  afterEach(function () {
    fs.existsSync = origExists;
    fs.readFileSync = origRead;
    _resetCacheForTests();
    delete process.env[FILE_NAME];
    delete process.env[ENV_NAME];
    delete process.env[CACHE_NAME];
  });

  it("prefers a /run/secrets/<name> file over the env var (trimmed)", function () {
    fs.existsSync = (p) => p === "/run/secrets/" + FILE_NAME;
    fs.readFileSync = () => "  filesecret\n";
    process.env[FILE_NAME] = "envsecret";
    expect(readSecret(FILE_NAME)).to.equal("filesecret");
  });

  it("falls back to the env var when no secret file exists", function () {
    fs.existsSync = () => false;
    process.env[ENV_NAME] = "admin";
    expect(readSecret(ENV_NAME)).to.equal("admin");
  });

  it("returns the default when neither file nor env is present", function () {
    fs.existsSync = () => false;
    expect(readSecret(ABSENT_NAME, "def")).to.equal("def");
    _resetCacheForTests();
    expect(readSecret(ABSENT_NAME)).to.equal(null);
  });

  it("caches the resolved value across calls", function () {
    fs.existsSync = () => false;
    process.env[CACHE_NAME] = "first";
    const a = readSecret(CACHE_NAME);
    process.env[CACHE_NAME] = "second";
    const b = readSecret(CACHE_NAME);
    expect(a).to.equal("first");
    expect(b).to.equal("first"); // cached, not re-read
  });

  // SEC-CFG-01: Path traversal vulnerability mitigation tests
  describe("path traversal protection", function () {

    it("rejects relative path traversal with ../", function () {
      fs.existsSync = () => true;
      fs.readFileSync = () => "leaked_secret";
      process.env["../etc/passwd"] = "fallback";
      
      const result = readSecret("../etc/passwd", "default");
      // Should fall back to env or default, not read the traversed path
      expect(result).to.equal("fallback");
    });

    it("rejects multiple levels of path traversal", function () {
      fs.existsSync = () => true;
      fs.readFileSync = () => "leaked_secret";
      process.env["../../etc/shadow"] = "fallback";
      
      const result = readSecret("../../etc/shadow", "default");
      expect(result).to.equal("fallback");
    });

    it("rejects absolute paths", function () {
      fs.existsSync = () => true;
      fs.readFileSync = () => "leaked_secret";
      process.env["/etc/passwd"] = "fallback";
      
      const result = readSecret("/etc/passwd", "default");
      expect(result).to.equal("fallback");
    });

    it("rejects path traversal with encoded characters", function () {
      fs.existsSync = () => true;
      fs.readFileSync = () => "leaked_secret";
      const traversalName = "..%2F..%2Fetc%2Fpasswd";
      process.env[traversalName] = "fallback";
      
      const result = readSecret(traversalName, "default");
      expect(result).to.equal("fallback");
    });

    it("allows valid secret names without path components", function () {
      const validName = "VALID_SECRET_NAME";
      fs.existsSync = (p) => p === "/run/secrets/" + validName;
      fs.readFileSync = () => "  valid_secret_value\n";
      
      const result = readSecret(validName);
      expect(result).to.equal("valid_secret_value");
    });

  });

});
