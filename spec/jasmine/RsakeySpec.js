describe("RSA Key", function() {

  var RSAKey = require("../../lib/thinx/rsakey");

  var envi = require("./_envi.json");
  var owner = envi.oid;

  var invalid_fingerprints = [
    "a9:fd:f3:8e:97:7d:f4:c1:e1:39:3f:fd:2b:3b:5f:9_"
  ];

  var revoked_fingerprints = [
    "a9:fd:f3:8e:97:7d:f4:c1:e1:39:3f:fd:2b:3b:5f:9f"
  ];

  var test_key_body = "matej-jasmine-test-rsa-key";

  it("should be able to add RSA Keys first", function(done) {
    RSAKey.add(owner, "matej-jasmine-test-rsa-key", test_key_body,
      function(success, response) {
        console.log(response);
        console.log("RSA add result: " + JSON.stringify(response));
        this.revoked_fingerprint = response;
        expect(success).toBe(true);
        done();
      });

  }, 10000);

  it("should fail on invalid revocation", function(
    done) {
    RSAKey.revoke(owner, invalid_fingerprints,
      function(success, message) {
        console.log("RSA revocation result: " +
          JSON.stringify(
            message));
        expect(success).toBe(false);
        expect(message).toBeDefined();
        done();
      }, 10000);

    it("should be able to revoke multiple RSA Keys at once",
      function(done) {
        RSAKey.revoke(owner, revoked_fingerprints,
          function(success, message) {
            console.log("RSA revocation result: " + JSON.stringify(
              message));
            expect(success).toBe(true);
            expect(message).toBeDefined();
            done();
          });
      }, 10000);

    it("should be able to list RSA Keys",
      function(done) {
        RSAKey.list(owner, function(success, message) {
          console.log(
            "RSA list result: " +
            JSON.stringify(
              message));
          expect(success).toBe(true);
          done();
        });
      });
  }, 10000);

});
