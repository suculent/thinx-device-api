describe("Build log", function() {

  var expect = require('chai').expect;
  var BuildLog = require("../../lib/thinx/buildlog");
  var blog = new BuildLog();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var build_id = envi.build_id;

  /*
   * WebSocket Server
   */

  it("(01) should be able to initialize", function() {
    expect(blog).to.be.a('object');
  });

  it("(02) should be able to log", function(done) {
    let contents1 = "mock log message contents one";
    blog.log(build_id, owner, udid, "Testing build log create...", contents1, (error, body) => {
      expect(body).to.exist; // body.ok should be true
      expect(error).to.equal(null);
      done();
    });
  });

  it("(03) should be able to append existing log", function(done) {
  let contents2 = "mock log message contents one";
    blog.log(build_id, owner, udid, "Testing build log append...", contents2, (error, body) => {
      expect(error).to.equal(null);
      expect(body).to.be.a('object');
      done();
    });
  });

  it("(04) should be able to list build logs", function(done) {
    blog.list(owner, function(err, body) {
      expect(err).to.be.false; // err should be null
      expect(body).to.be.an('object'); // { rows: [] }
      let rows = body.rows;
      var last_build = rows[0];
      if ((typeof(last_build) !== "undefined") && (last_build !== null)) {
        blog.fetch(last_build.id, function(berr, bbody) {
          expect(berr).to.equal(false);
          expect(bbody).to.be.an('object');
          done();
        });
      } else {
        // logs may be empty
        done();
      }
    });
  }, 15000);

  it("(05) should be able to tail log for build_id", function() {
    const no_socket = null;
    blog.logtail(build_id, require("../_envi.json").oid, no_socket, function(success) {
        if (success !== true) {
          console.log(success); // error reason
        }
        expect(success).to.equal(true);
      });
  });

  it("(05) should provide path for device", function() {
    var path = blog.pathForDevice(owner, udid);
    // e.g. /mnt/data/data/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172
    // lastItem == typeof UDID
    // lastItem-1 == typeof OWNER
    expect(path).to.be.a('string');
  });

});
