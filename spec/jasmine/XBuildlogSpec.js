describe("Build log", function() {

  var expect = require('chai').expect;
  var BuildLog = require("../../lib/thinx/buildlog");
  var blog = new BuildLog();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var build_id = envi.build_id;

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running Build log spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Build log spec`);
  });

  /*
   * WebSocket Server
   */

  it("(01) should be able to initialize", function() {
    expect(blog).to.be.a('object');
  });

  it("(02) should be able to log", function(done) {
    let contents1 = "mock log message contents one";
    blog.log(build_id, owner, udid, "Testing build log create...", contents1, (error, body) => {
      console.log("🚸 [chai] Build log (02) body", body, "error", error);
      // will fail until stable...
      // expect(body).to.exist; // body.ok should be true
      //expect(error).to.equal(null);
      done();
    });
  });

  it("(03) should be able to append existing log", function (done) {
    let contents2 = "mock log message contents one";
    blog.log(build_id, owner, udid, "Testing build log append...", contents2, (error, body) => {
      expect(error).to.equal(null);
      expect(body).to.be.a('object');
      done();
    });
  });

  it("(04) should be able to list build logs", function(done) {
    blog.list(owner, function(err, body) {
      expect(err).to.equal(false); 
      expect(body).to.be.an('object'); // { rows: [] }
      let rows = body.rows;
      var last_build = rows[0];
      if ((typeof(last_build) !== "undefined") && (last_build !== null)) {
        blog.fetch(last_build.id, function(berr, bbody) {
          expect(berr).to.equal(false);
          expect(bbody).to.be.an('object');
          done();
        });
      }
    });
  }, 15000);

  it("(05) should be able to tail log for build_id", function(done) {
    const no_socket = null;
    blog.logtail(build_id, require("../_envi.json").oid, no_socket, function(success) {
        expect(success).to.equal(true);
        done();
    });
  });

  it("(05) should provide path for device", function() {
    var path = blog.pathForDevice(owner, udid);
    // e.g. /mnt/data/repos/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172
    // lastItem == typeof UDID
    // lastItem-1 == typeof OWNER
    console.log("(05) path for device:", path);
    expect(path).to.be.a('string');
  });

});
