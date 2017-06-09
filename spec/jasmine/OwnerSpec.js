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

  it("should be able to update owner avatar", function() {
    var body = {
      avatar: "test-image-vole"
    };
    User.update(owner, body, function(success, response) {
      console.log(JSON.stringify(response));
      expect(success).toBe(true);
    });
  });

  it("should be able to update owner info", function() {
    var body = {
      info: "test-deletes-your-data-dude"
    };
    User.update(owner, body, function(success, response) {
      console.log(JSON.stringify(response));
      expect(success).toBe(true);
    });
  });

  // Happens on this data-type but is sources.js responsibility, where's the fail?

  xit("should be able to begin reset owner password", function() {});
  xit("should be able to set owner password", function() {});

  xit("should be able to activate owner", function() {});
  xit("should be able to create owner profile", function() {});
});
