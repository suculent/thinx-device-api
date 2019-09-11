var generated_key_name = null;
var envi = require("./_envi.json");
var owner = envi.oid;

var APIEnv = require('../../lib/thinx/apienv');
var apienv = new APIEnv();

describe("API Env", function() {

  // create: function(owner, name, value, callback)
  it("should be able to store new environment variable", function(done) {

    apienv.create(
      owner,
      "sample-var-name",
      "sample-var-value",
      function(success, object) {

        expect(object).toBeDefined();

        if (success) {

          this.generated_key_name = "sample-var-name";
          console.log("APIEnv ready to revoke: " + this.generated_key_name);

          // fetch: function(name, callback)
          if ("should be able to fetch specific env var",
            function(done) {
              console.log("Fetching env var...");
              apienv.fetch(
                owner,
                "sample-var-name",
                function(err, response) {
                  expect(err).toBe(false);
                  expect(response).toBeDefined();
                  console.log("running inherited test... (o'rly?)");
                  // revoke: function(owner, name, callback)
                  it(
                    "should be able to revoke environment variables",
                    function(done) {
                      apienv.revoke(
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

  // list: function(owner, callback)
  it("should be able to list environment variables",
    function(done) {
      apienv.list(
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

  // revoke: function(owner, name, callback)
  it("should be able to fail on invalid env var revocation", function(done) {
      console.log("Revoking invalid env var...");
      apienv.revoke(
        owner, [
          "sample-key-hash"
        ],
        function(success) {
          expect(success).toBe(false);
          done();
        });
    }, 5000);

});
