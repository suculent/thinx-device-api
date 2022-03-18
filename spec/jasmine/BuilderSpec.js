var Builder = require("../../lib/thinx/builder");
var Queue = require("../../lib/thinx/queue");

var expect = require('chai').expect;

describe("Builder", function() {

  var builder = new Builder();
  var queue = new Queue(builder);

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var build_id = envi.build_id; // "f168def0-597f-11e7-a932-014d5b00c004";
  var source_id = envi.sid;

  it("should be able to initialize", function() {
    expect(builder).to.be.a('object');
  });

  it("should be able to dry-run", function(done) {
    var build = {
      udid: udid,
      source_id: source_id,
      dryrun: true
    };
    let worker = null;
    builder.build(
      owner,
      build,
      [], // notifiers
      function(success, message, xbuild_id) {
        console.log("[spec] build dry", {success}, {message}, {xbuild_id});
        done();
      }, // callback
      worker
    );
  }, 120000);

  it("should be able to run", function(done) {
    var build = {
      udid: udid,
      source_id: source_id,
      dryrun: false
    };
    let worker = null;
    builder.build(
      owner, 
      build, 
      [], // notifiers
      function(success, message, build_id2) {
        console.log("[spec] build dry", {success}, {message}, {build_id2});
        done();
      }, // callback
      worker
    );
  }, 120000);

  it("supports certain languages", function() {
    var languages = builder.supportedLanguages();
    expect(languages).to.be.a('array');
  });

  it("supports certain extensions", function() {
    var extensions = builder.supportedExtensions();
    expect(extensions).to.be.a('array');
  });

  it("should not fail on build", function(done) {

    let build_request = {
      worker: queue.getWorkers()[0],
      build_id: build_id,
      owner: owner,
      git: "https://github.com/suculent/thinx-firmware-esp8266-pio.git",
      branch: "origin/master",
      udid: "mock-udid-nevim" // expected to exist – may need to fetch details
    };

    let transmit_key = "mock-transmit-key";
      builder.run_build(build_request, [] /* notifiers */, function(success, result) {
        console.log("[spec] build TODO", {success}, {result});
        done();
      }, transmit_key);
    });
});
