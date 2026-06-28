// Unit tests for Docker Secrets support (#418 / SEC-CFG-01).
// readSecret() depends only on fs, so these run with no live services — fs is
// stubbed to simulate the presence/absence of /run/secrets/<name>.

const expect = require('chai').expect;
const fs = require('fs');
const { readSecret, _resetCacheForTests } = require("../../lib/thinx/secrets");

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
  });

  it("prefers a /run/secrets/<name> file over the env var (trimmed)", function () {
    fs.existsSync = (p) => p === "/run/secrets/REDIS_PASSWORD";
    fs.readFileSync = () => "  filesecret\n";
    process.env.REDIS_PASSWORD = "envsecret";
    expect(readSecret("REDIS_PASSWORD")).to.equal("filesecret");
    delete process.env.REDIS_PASSWORD;
  });

  it("falls back to the env var when no secret file exists", function () {
    fs.existsSync = () => false;
    process.env.COUCHDB_USER = "admin";
    expect(readSecret("COUCHDB_USER")).to.equal("admin");
    delete process.env.COUCHDB_USER;
  });

  it("returns the default when neither file nor env is present", function () {
    fs.existsSync = () => false;
    delete process.env.SOME_ABSENT_SECRET;
    expect(readSecret("SOME_ABSENT_SECRET", "def")).to.equal("def");
    expect(readSecret("SOME_ABSENT_SECRET_2")).to.equal(null);
  });

  it("caches the resolved value across calls", function () {
    fs.existsSync = () => false;
    process.env.CACHED_SECRET = "first";
    const a = readSecret("CACHED_SECRET");
    process.env.CACHED_SECRET = "second";
    const b = readSecret("CACHED_SECRET");
    expect(a).to.equal("first");
    expect(b).to.equal("first"); // cached, not re-read
    delete process.env.CACHED_SECRET;
  });

});
