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

});
