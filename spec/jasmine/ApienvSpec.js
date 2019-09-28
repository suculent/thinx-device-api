var generated_key_name = null;
var envi = require("../_envi.json");
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
          done();
        }
      });
    }, 30000);

    it("should be able to fetch specific env var", function(done) {
      //console.log("Fetching env var...");
      apienv.fetch(
        owner,
        "sample-var-name",
        function(success, response) {
          expect(success).toBe(true);
          expect(response).toBeDefined();
          done();
      });
    }, 3000);

    it("should be able to revoke environment variables",
    function(done) {
      const changes = [
        "sample-var-name"
      ];
      apienv.revoke(
        owner,
        changes,
        function(success, object) {
          if (success) {
            expect(object).toBeDefined();
          } else {
            console.log( "[APIEnv] Revocation failed:" + object);
          }
          done();
        });
      }, 5000);

      // list: function(owner, callback)
      it("should be able to list environment variables", function(done) {
        apienv.list(
          owner,
          function(success, object) {
            if (success) {
              expect(object).toBeDefined();
            } else {
              console.log("[APIEnv] Listing failed:" + object);
            }
            done();
          });
        }, 5000);

        // revoke: function(owner, name, callback)
        it("should be able to fail on invalid env var revocation", function(done) {
          const changes = [
            "invalid-var-name"
          ];
          apienv.revoke(
            owner,
            changes,
            function(success) {
              expect(success).toBe(false);
              done();
            });
          }, 5000);

        });
