describe("Builder", function() {

  //anything in here will apply to everything in each nested describe
  var Builder = require("../../lib/thinx/builder");
  var builder = new Builder();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var build_id = envi.build_id; // "f168def0-597f-11e7-a932-014d5b00c004";
  var source_id = envi.sid;

  it("should be able to initialize", function() {
    expect(builder).toBeDefined();
  });

  it("should be able to dry-run", function(done) {
    var build = {
      udid: udid,
      source_id: source_id,
      dryrun: true
    };
    builder.build(owner, build, [], function(success, message, build_id) {
      done();
    });
  }, 120000);

  it("should be able to run", function(done) {
    var build = {
      udid: udid,
      source_id: source_id,
      dryrun: false
    };
    builder.build(owner, build, [], function(success, message, build_id) {
      done();
    });
  }, 120000);

  it("supports certain languages", function() {
    var languages = builder.supportedLanguages();
    expect(languages).toBeDefined();
    //console.log(JSON.stringify(languages));
  });

  it("supports certain extensions", function() {
    var extensions = builder.supportedExtensions();
    expect(extensions).toBeDefined();
    //console.log(JSON.stringify(extensions));
  });

});
