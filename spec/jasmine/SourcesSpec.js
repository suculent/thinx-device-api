describe("Sources", function() {

  var Sources = require('../../lib/thinx/sources');
  var envi = require("./_envi.json");
  var owner = envi.oid;
  var source_id = null; // will be populated by test and then destroyed

  it("should be able to be added", function(done) {
    Sources.add(owner, "test-git-repo-SourcesSpec.js",
      "https://github.com/suculent/thinx-device-api",
      "origin/master",
      function(success, response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        this.source_id = response.source_id;
        console.log("Source Add Response: "+response);
        done();
      });
  }, 10000);

  it("should be able to provide a list", function(done) {
    Sources.list(owner, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Source List Response: "+response);
      done();
    });
  }, 10000);

  it("should be able to be removed",
    function(done) {
      Sources.remove(owner, [source_id], function(success,
        response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        source_id = this.source_id;
        console.log("Source Removal Response: "+response);
        done();
      });
    }, 10000);
});
