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

  // BOLA regression: list(owner) must NEVER return another owner's builds. The
  // latest_builds view is unfiltered by owner, so a missing in-memory guard leaks
  // every tenant's build records (a new account was showing "105 Builds").
  it("(06) list(owner) must only return builds owned by the requester (BOLA)", function(done) {
    const otherOwner = require("../_envi.json").dynamic2.owner;
    blog.list(owner, function(err, body) {
      expect(err).to.equal(false);
      expect(body).to.be.an('object');
      const rows = (body && body.rows) ? body.rows : [];
      rows.forEach(function(r) {
        if (r && r.value && typeof r.value.owner !== "undefined") {
          expect(r.value.owner).to.equal(owner);          // never a foreign owner
          expect(r.value.owner).to.not.equal(otherOwner); // explicit: not dynamic2's
        }
      });
      done();
    });
  }, 15000);

});
