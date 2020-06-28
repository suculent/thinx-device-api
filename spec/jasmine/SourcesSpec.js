describe("Sources", function() {

  var expect = require('chai').expect;
  var sources = require('../../lib/thinx/sources');
  var Sources = new sources();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var source_id;
  const source_name = "thinx-device-api-test";

  it("should be able to be added", function(done) {
    const source = {
      name: source_name,
      owner: owner,
      branch: "origin/master",
      url: "https://github.com/suculent/thinx-firmware-esp8266-pio",
      platform: "arduino"
    };
    Sources.add(source,
      (success, response) => {
        if (success === false) {
          console.log("Error adding source: " + response);
        }
        //console.log("Source Add Response: " , {response});
        expect(success).to.equal(true);
        expect(response).to.be.a('string');
        source_id = response.source_id;
        done();
      });
  }, 10000);

  it("should be able to provide a list", function(done) {
    Sources.list(owner, function(success, response) {
      expect(success).to.equal(true);
      expect(response).to.be.a('string');
      //console.log("Source List Response: " , {response});
      done();
    });
  }, 10000);

  it("should be able to be removed", function(done) {

    const source = {
      owner: owner,
      branch: "origin/master",
      url: "https://github.com/suculent/thinx-firmware-esp8266-pio",
      platform: "nodejs"
    };

    /// Add something to be removed
    Sources.add(source,
      (success, response) => {
        if (success === false) {
          console.log("Error adding source: " + response);
        }
        console.log("Source Add Response: " , {response});
        //expect(success).to.equal(true);
        expect(response).to.be.a('string');
        source_id = response.source_id;

        Sources.remove(source.owner, [source_id], (success, response) => {
          if (success === false) {
            console.log("Error removing source: " + response);
          }
          expect(success).to.equal(true);
          //expect(response).to.be.a('string');
          if (typeof(response) !== "undefined") {
            console.log("Sources Removal Response: " , {response});
          }
          done();
        });

      });
  }, 20000);

  it("should be able to validate branch name", function() {
    let source = {
      branch: "origin/master"
    }
    let result = Sources.validateBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.be.true;
  });

  it("should be able to validate url", function() {
    let source = {
      url: "git@github.com/suculent/thinx-device-api"
    }
    let result = Sources.validateBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.be.true;
  });

  it("should be able to invalidate branch name", function() {
    let source = {
      branch: "origin/mas'ter"
    }
    let result = Sources.validateBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.be.false;
  });

  it("should be able to invalidate url", function() {
    let source = {
      url: "git@github.com/;;suculent/thinx-device-api"
    }
    let result = Sources.validateBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.be.false;
  });

});
