describe("Builder", function() {

  var builder = require("../../lib/thinx/builder");

  var envi = require("_envi.json");
  var owner = envi.owner;
  var udid = envi.udid;
  var apikey = envi.ak;
  var build_id = envi.build_id; // "f168def0-597f-11e7-a932-014d5b00c004";
  var source_id = envi.sid;

  it("should be able to initialize", function() {
    expect(builder).toBeDefined();
  });

  it("should be able to dry-run", function(done) {
    var wrapper = {
      build: {
        udid: udid,
        source_id: source_id,
        dryrun: true
      }
    };
    builder.build(owner, wrapper, function(success, message, build_id) {
      done();
    });
  }, 60000);

  it("should be able to run", function(done) {
    var wrapper = {
      build: {
        udid: udid,
        source_id: source_id,
        dryrun: false
      }
    };
    builder.build(owner, wrapper, function(success, message, build_id) {
      done();
    });
  }, 60000);

});
