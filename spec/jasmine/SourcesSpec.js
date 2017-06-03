describe("Owner", function() {

  var generated_key_hash = null;
  var Sources = require('../../lib/thinx/sources');

  var owner =
    "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";

  var source_id = null;

  it("should be able to list owner sources", function() {
    Sources.list(owner, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log(response);
    });
  });

  it("should be able to add source", function() {
    Sources.add(owner, "test-git-repo",
      "https://github.com/suculent/thinx-device-api",
      "origin/master",
      function(success, response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        source_id = response.source_id;
        console.log(response);
      });
  });

  it("should be able to remove previously added source", function() {
    Sources.remove(owner, source_id, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      source_id = response.source_id;
      console.log(response);
    });
  });

});
