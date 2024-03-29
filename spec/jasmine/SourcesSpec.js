const expect = require('chai').expect;
const Sources = require('../../lib/thinx/sources');
let sources = new Sources();

const envi = require("../_envi.json");
const source_name = "thinx-device-api-test";

let owner = envi.oid;
let source_id;

describe("Sources", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running Sources spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Sources spec`);
  });

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
    sources.add(source,
      (success, response) => {
        if (success !== true) {
          console.log("(01) Error adding source: ", source, response);
        }
        expect(success).to.equal(true); // git fetch must work for this
        expect(response).to.be.an('object');
        source_id = response.source_id;
        done();
      });
  }, 30000);

  it("(02) should be able to provide a list", function (done) {
    sources.list(owner, function (success, response) {
      expect(success).to.equal(true);
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
    sources.add(source,
      (success, response) => {
        if (success !== true) {
          console.log("(03) Error adding source: ", source, response);
        }
        expect(success).to.equal(true);
        source_id = response.source_id;
        sources.remove(source.owner, [source_id], (rsuccess, rresponse) => {
          if (rsuccess === false) {
            console.log("Error removing source: " + rresponse);
          }
          expect(rsuccess).to.equal(true);
          expect(rresponse).to.be.an('object');
          done();
        });
      });
  }, 30000);

  it("(04) should be able to accept valid branch name", function (done) {
    let source = {
      branch: "origin/main"
    };
    let result = sources.normalizedBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.equal("main");
    done();
  });

  it("(05) should be able to accept valid URL", function (done) {
    let source = {
      url: "git@github.com/suculent/thinx-device-api"
    };
    let result = sources.normalizedBranch(source, (error, reason) => {
      console.log("validateBranch error:", error, reason);
    });
    expect(result).to.equal("main");
    done();
  });

  it("(06) should be able to reject invalid branch name", function (done) {
    let source = {
      branch: "origin/mas'ter"
    };
    let result = sources.normalizedBranch(source, (error, reason) => {
      expect(error).to.equal(true);
      expect(reason).to.equal('invalid_branch_name');
    });
    expect(result).to.equal(false);
    done();
  });

  it("(07) should be able to reject invalid URL", function (done) {
    let source = {
      url: "git@github.com/;;suculent/thinx-device-api"
    };
    let result = sources.validateURL(source, function (error, reason) {
      console.log(error, reason);
    });
    expect(result).to.equal(null);
    done();
  });

  it("(08) should be able to infer owner ID from path", function () {
    let ownerIdFromPath = sources.ownerIdFromPath("/mnt/data/repos/" + owner + "/" + source_id);
    expect(ownerIdFromPath).to.be.a('string');
  });

  it("(09) should update repo privacy prefetch state", function (done) {
    let source_id = "7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3";
    sources.update(owner, source_id, "is_private", true, (success, error) => {
      if (!success) console.log("[09] error", error);
      expect(success).to.equal(true);
      done();
    });
  });

  it("(10) should update last build version", function (done) {
    let source_id = "7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3";
    sources.update(owner, source_id, "last_build", "1.1.1", (success, error) => {
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
      secret: process.env.GITHUB_SECRET,
      circle_key: "<circleci-project-key>",
      is_private: false
    };

    /// Add something to be removed
    sources.add(source,
      (success, response) => {
        if (success !== true) {
          console.log("(11) Error adding source: ", source, response);
        }
        expect(success).to.equal(true);
        source_id = response.source_id;
        sources.updatePlatform(owner, source_id, "arduino", (success2, error2) => {
          if (!success2) console.log("(11) error", error2);
          expect(success2).to.equal(true);
          done();
        });
      });
  }, 30000);

  it("(12) should be able to remove sources from owner", function () {
    sources.removeSourcesFromOwner(owner, [source_id]);
  });

});
