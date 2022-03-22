describe("Sources", function () {

  var expect = require('chai').expect;
  var sources = require('../../lib/thinx/sources');
  var Sources = new sources();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var source_id;
  const source_name = "thinx-device-api-test";

  it("(01) should be able to be added", function (done) {
    const source = {
      name: source_name,
      owner: owner,
      branch: "origin/master",
      url: "https://github.com/suculent/thinx-firmware-esp8266-pio",
      platform: "arduino",
      secret: "<github-secret>",
      circle_key: "<circleci-project-key>",
      is_private: false
    };
    Sources.add(source,
      (success, response) => {
        if (success !== true) {
          console.log("(01) Error adding source: ", source, response);
        }
        expect(success).to.be.true; // git fetch must work for this
        expect(response).to.be.an('object');
        source_id = response.source_id;
        done();
      });
  }, 20000);

  it("(02) should be able to provide a list", function (done) {
    Sources.list(owner, function (success, response) {
      expect(success).to.be.true;
      expect(response).to.be.an('object');
      done();
    });
  }, 10000);
  
  it("(03) should be able to be removed", function (done) {

    const source = {
      name: source_name + "-2",
      owner: owner,
      branch: "origin/master",
      url: "https://github.com/suculent/thinx-firmware-esp8266",
      platform: "arduino",
      secret: "<github-secret>",
      circle_key: "<circleci-project-key>",
      is_private: false
    };

    /// Add something to be removed
    Sources.add(source,
      (success, response) => {
        if (success !== true) {
          console.log("(03) Error adding source: ", source, response);
        }
        expect(success).to.be.true;
        source_id = response.source_id;
        Sources.remove(source.owner, [source_id], (rsuccess, rresponse) => {
          if (rsuccess === false) {
            console.log("Error removing source: " + rresponse);
          }
          expect(rsuccess).to.be.true;
          expect(rresponse).to.be.an('object');
          done();
        });
      });
  }, 20000);

  it("(04) should be able to accept valid branch name", function (done) {
    let source = {
      branch: "origin/main"
    };
    let result = Sources.normalizedBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.equal("main");
    done();
  });

  it("(05) should be able to accept valid URL", function (done) {
    let source = {
      url: "git@github.com/suculent/thinx-device-api"
    };
    let result = Sources.normalizedBranch(source, (error, reason) => {
      console.log("validateBranch error:", error, reason);
    });
    expect(result).to.equal("main");
    done();
  });

  it("(06) should be able to reject invalid branch name", function (done) {
    let source = {
      branch: "origin/mas'ter"
    };
    let result = Sources.normalizedBranch(source, (error, reason) => {
      expect(error).to.be.true;
      expect(reason).to.equal('invalid_branch_name');
    });
    expect(result).to.equal(false);
    done();
  });

  it("(07) should be able to reject invalid URL", function (done) {
    let source = {
      url: "git@github.com/;;suculent/thinx-device-api"
    };
    let result = Sources.validateURL(source, function (error, reason) {
      console.log(error, reason);
    });
    expect(result).to.equal(null);
    done();
  });

  it("(08) should be able to infer owner ID from path", function () {
    let ownerIdFromPath = Sources.ownerIdFromPath("/mnt/data/data/" + owner + "/" + source_id);
    expect(ownerIdFromPath).to.be.a('string');
  });

  it("(09) should update repo privacy prefetch state", function (done) {
    let source_id = "7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3";
    Sources.updatePrivate(owner, source_id, true, (success, error) => {
      if (!success) console.log("[09] error", error);
      expect(success).to.equal(true);
      done();
    });
  });

  it("(10) should update last build version", function (done) {
    let source_id = "7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3";
    Sources.updateLastBuild(owner, source_id, "1.1.1", (success, error) => {
      if (!success) console.log("[10] error", error);
      expect(success).to.equal(true);
      done();
    });
  });

  it("(11) should update repo platform", function (done) {
    const source = {
      name: source_name + "-2",
      owner: owner,
      branch: "origin/master",
      url: "https://github.com/suculent/thinx-firmware-esp8266",
      platform: "arduino",
      secret: "<github-secret>",
      circle_key: "<circleci-project-key>",
      is_private: false
    };

    /// Add something to be removed
    Sources.add(source,
      (success, response) => {
        if (success !== true) {
          console.log("(03) Error adding source: ", source, response);
        }
        expect(success).to.be.true;
        source_id = response.source_id;
        Sources.updatePlatform(owner, source_id, "arduino", (success2, error2) => {
          if (!success2) console.log("[09] error", error2);
          expect(success2).to.equal(true);
          done();
        });
      });
  });

});
