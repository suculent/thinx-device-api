describe("Sources", function() {

  var expect = require('chai').expect;
  var sources = require('../../lib/thinx/sources');
  var Sources = new sources();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var source_id;
  const source_name = "thinx-device-api-test";

  it("(01) should be able to be added", function(done) {
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
          console.log("(01) Error adding source: ", source, response);
        }
        //expect(success).to.be.true; // git fetch must work for this
        expect(response).to.be.an('object');
        source_id = response.source_id;
        done();
      });
  }, 20000);

  it("(02) should be able to provide a list", function(done) {
    Sources.list(owner, function(success, response) {
      expect(success).to.be.true;
      expect(response).to.be.an('object');
      //console.log("Source List Response: " , {response});
      done();
    });
  }, 10000);

  it("(03) should be able to be removed", function(done) {

    const source = {
      name: source_name + "-2",
      owner: owner,
      branch: "origin/master",
      url: "https://github.com/suculent/thinx-firmware-esp8266",
      platform: "arduino"
    };

    /// Add something to be removed
    Sources.add(source,
      (success, response) => {
        if (success === false) {
          console.log("(03) Error adding source: ", source, response);
        }
        //expect(success).to.be.true;
        source_id = response.source_id;
        Sources.remove(source.owner, [source_id], (rsuccess, rresponse) => {
          if (rsuccess === false) {
            console.log("Error removing source: " + rresponse);
          }
          //expect(rsuccess).to.be.true;
          expect(rresponse).to.be.an('object');
          done();
        });
      });
  }, 20000);

  it("(04) should be able to validate branch name", function() {
    let source = {
      branch: "origin/main"
    };
    let result = Sources.normalizedBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.equal("main");
    
  });

  it("(05) should be able to validate url", function() {
    let source = {
      url: "git@github.com/suculent/thinx-device-api"
    };
    let result = Sources.normalizedBranch(source, (error) => {
      console.log("validateBranch error:", error);            
    });
    expect(result).to.equal("main");
  });

  it("(06) should be able to invalidate branch name", function() {
    let source = {
      branch: "origin/mas'ter"
    };
    let result = Sources.normalizedBranch(source, (error) => {
      console.log(error);
    });
    expect(result).to.equal(false);
  });

  it("(07) should be able to invalidate url", function() {
    let source = {
      url: "git@github.com/;;suculent/thinx-device-api"
    };
    let result = Sources.validateURL(source, function(error) {
      console.log(error);
    });
    expect(result).to.equal(null);
    
  });

});
