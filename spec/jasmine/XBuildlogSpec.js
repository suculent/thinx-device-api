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

  it("(02) should be able to list build logs", function(done) {
    blog.list(owner, function(err, body) {
      console.log("[test] [info] build_logs", body);
      // err should be null
      expect(body).to.be.an('object'); // { rows: [] } in case of empty; ahways has dows
      var last_build_id = body.rows[0];
      if ((typeof(last_build_id) !== "undefined") && (last_build_id !== null)) {
        blog.fetch(last_build_id, function(berr, bbody) {
          console.log("[test] ✅ build log body:", bbody);
          expect(berr).to.equal(false);
          done();
        });
      }
      done();
    });
  }, 15000);

  it("(03) should be able to log", function(done) {
    blog.log(build_id, owner, udid, "Testing build log create...");
    done();
  });

  it("(04) should be able to append existing log", function(done) {
    blog.log(build_id, owner, udid, "Testing build log append...");
    done();
  });

  it("(05) should be able to tail log for build_id", function() {
    const no_socket = null;
    blog.logtail(build_id, require("../_envi.json").oid, no_socket, function(success) {
        if (success !== true) {
          console.log(success); // error reason
        }
        expect(success).to.be.true;
      });
  });

  it("(05) should provide path for device", function() {
    var path = blog.pathForDevice(owner, udid);
    console.log("(05) path: ", path);
    expect(path).to.be.a('string');
  });

});
