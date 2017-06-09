describe("RSA Key", function() {

  var generated_key_hash = null;
  var RSAKey = require('../../lib/thinx/rsakey');
  var owner =
    "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
  var revoked_fingerprints = [
    "d3:04:a5:05:a2:11:ff:44:4b:47:15:68:4d:2a:f8:93"
  ];
  var test_key_alias = Date().toString();
  var test_key_body = "TEST-KEY-AT:" + test_key_alias;

  it("should be able to add RSA Keys first", function(done) {
    RSAKey.add(owner, test_key_alias, test_key_body,
      function(success, response) {
        console.log(response);
        // TODO: Take fingerprint and reuse as [revoked_fingerprints        ]
        expect(success).toBe(true);
        done();
      });
  }, 10000);

  it("should be able to revoke multiple RSA Keys at once", function(done) {
    // TODO: Take fingerprint and reuse as [revoked_fingerprints
    RSAKey.revoke(owner, revoked_fingerprints,
      function(success, message) {
        expect(success).toBeDefined();
        expect(message).toBeDefined();
        done();
      });
  }, 10000);

  it("should be able to list RSA Keys", function(done) {
    RSAKey.list(owner, function(success, message) {
      console.log(message);
      expect(success).toBe(true);
      done();
    });
  }, 10000);

});
