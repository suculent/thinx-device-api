describe("Owner", function() {

  var generated_key_hash = null;
  var User = require('../../lib/thinx/owner');

  var owner =
    "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";

  it("should be able to fetch owner profile", function() {
    User.profile(owner, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
    });
  });

  xit("should be able to create owner profile", function() {});
  xit("should be able to begin reset owner password", function() {});
  xit("should be able to activate owner", function() {});
  xit("should be able to set owner password", function() {});
  xit("should be able to add new source", function() {});
  xit("should be able to remove a sources", function() {});
  xit("should be able to list sources", function() {});
  xit("should be able to add new rsa key", function() {});
  xit("should be able to remove rsa keys", function() {});
  xit("should be able to list rsa keys", function() {});

});

// exports.profile = Owner.profile;
// exports.create = Owner.create;
// exports.begin_reset_password = Owner.begin_reset_password;
// exports.password_reset = Owner.password_reset;
// exports.activate = Owner.activate;
// exports.set_password = Owner.set_password;
// exports.add_source = Owner.add_source;
// exports.remove_sources = Owner.remove_sources;
// exports.sources = Owner.sources;
// exports.add_rsakey = Owner.add_rsakey;
// exports.remove_rsakeys = Owner.remove_rsakeys;
// exports.rsa_keys = Owner.rsa_keys;
