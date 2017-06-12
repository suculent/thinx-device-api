describe("Builder", function() {

  var builder = require("../../lib/thinx/builder");

  var build_id = "0xBUILD_ID";
  var owner =
    "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
  var udid = "fcdd7b20-3980-11e7-a58d-81e4acfbeb86";
  var source_id =
    "7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f4";

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
  });

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
  });

});
