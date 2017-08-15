describe("Owner", function() {

  var generated_key_hash = null;
  var Sources = require('../../lib/thinx/sources');

  var envi = require("./_envi.json");
  var owner = envi.oid;

  var source_id = null;

  it("should be able to add source", function(done) {
    Sources.add(owner, "test-git-repo",
      "https://github.com/suculent/thinx-device-api",
      "origin/master",
      function(success, response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        source_id = response.source_id;
        console.log(response);
        done();
      });
  }, 10000);

  it("should be able to list owner sources", function(done) {
    Sources.list(owner, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log(response);
      done();
    });
  }, 10000);

  it("should be able to remove previously added source",
    function(done) {
      Sources.remove(owner, [source_id], function(success,
        response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        source_id = response.source_id;
        console.log(response);
        done();
      });
    }, 10000);

});
