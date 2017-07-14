var generated_key_name = null;
var APIEnv = require('../../lib/thinx/apienv');

var envi = require("./_envi.json");
var owner = envi.owner;

describe("API Env", function() {

  describe("Storage", function() {

    // revoke: function(owner, name, callback)
    it(
      "should be able to fail on invalid env var revocation",
      function(done) {
        console.log("Revoking invalid env var...");
        APIEnv.revoke(
          owner, [
            "sample-key-hash"
          ],
          function(success) {
            expect(success).toBe(false);
            done();
          });
      }, 5000);

    // list: function(owner, callback)
    it("should be able to list environment variables",
      function(done) {
        APIEnv.list(
          owner,
          function(success, object) {
            if (success) {
              console.log(JSON.stringify(object));
              expect(object).toBeDefined();
            } else {
              console.log("[APIEnv] Listing failed:" +
                object);
            }
            done();
          }, 5000);
      });

    // create: function(owner, name, value, callback)
    it("should be able to store new environment varriable", function(
      done) {
      APIEnv.create(
        owner,
        "sample-var-name",
        "sample-var-value",
        function(success, object) {
          expect(object).toBeDefined();
          if (success) {
            this.generated_key_name = "sample-var-name";
            console.log("Key ready to revoke: " + this.generated_key_name);

            // fetch: function(name, callback)
            if ("should be able to fetch specific env var",
              function(done) {
                console.log("Fetching env var...");
                APIEnv.fetch(
                  owner,
                  "sample-var-name",
                  function(err, response) {
                    expect(err).toBe(false);
                    expect(response).toBeDefined();

                    // revoke: function(owner, name, callback)
                    it(
                      "should be able to revoke environment variables",
                      function(done) {
                        APIEnv.revoke(
                          owner,
                          this.generated_key_name,
                          function(success, object) {
                            if (success) {
                              console.log(JSON.stringify(
                                object));
                              expect(object).toBeDefined();
                            } else {
                              console.log(
                                "[APIEnv] Revocation failed:" +
                                object);
                            }
                            done();
                          }, 5000);
                      });

                    done();
                  });
              }, 3000);
          }

          done();

        });
    }, 30000);

  });

});
