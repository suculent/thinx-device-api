describe("RSA Key", function() {

  var generated_key_hash = null;
  var RSAKey = require('../../lib/thinx/rsakey');

  xit("should be able to create RSA Keys first", function() {});

  //revoke: function(owner, revoked_fingerprints, callback)
  it("should be able to revoke multiple RSA Keys at once", function() {
    var owner =
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
    var revoked_fingerprints = [
      "d3:04:a5:05:a2:11:ff:44:4b:47:15:68:4d:2a:f8:93"
    ];
    RSAKey.revoke(owner, revoked_fingerprints, function(success,
      message) {
      expect(success).toBeDefined();
      expect(message).toBeDefined();
    });
  });

});
