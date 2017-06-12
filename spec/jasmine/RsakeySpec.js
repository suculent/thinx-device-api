var generated_key_hash = null;
var RSAKey = require('../../lib/thinx/rsakey');
var owner =
  "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
var revoked_fingerprints = [
  "d3:04:a5:05:a2:11:ff:44:4b:47:15:68:4d:2a:f8:93"
];

var test_key_body = "matej-jasmine-test-rsa-key";

describe("RSA Key", function() {

  it("should be able to add RSA Keys first", function() {

    RSAKey.add(owner, "matej-jasmine-test-rsa-key", test_key_body,
      function(success, response) {
        console.log(response);
        console.log("RSA add result: " + JSON.stringify(response));
        this.revoked_fingerprint = response;
        expect(success).toBe(true);

        it("should be able to revoke multiple RSA Keys at once",
          function() {
            RSAKey.revoke(owner, [this.revoked_fingerprint],
              function(success, message) {
                console.log("RSA revocation result: " + JSON.stringify(
                  message));
                expect(success).toBe(true);
                expect(message).toBeDefined();

                it("should fail on invalid revocation", function() {
                  RSAKey.revoke(owner, [this.revoked_fingerprint],
                    function(success, message) {
                      console.log("RSA revocation result: " +
                        JSON.stringify(
                          message));
                      expect(success).toBe(false);
                      expect(message).toBeDefined();
                    });
                });
              });
          });
      });
  });

  it("should be able to list RSA Keys", function() {
    RSAKey.list(owner, function(success, message) {
      console.log("RSA list result: " + JSON.stringify(message));
      expect(success).toBe(true);
    });
  });

});
