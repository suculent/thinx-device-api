describe("Sources", function() {

  var Sources = require('../../lib/thinx/sources');
  var envi = require("./_envi.json");
  var owner = envi.oid;
  var source_id;

  const source_name = "thinx-device-api-test";

  it("should be able to be added", function(done) {
    Sources.add(owner,
      source_name,
      "https://github.com/suculent/thinx-device-api",
      "origin/master",
      function(success, response) {
        if (success === false) {
          console.log("Error adding source: " + response);
        }
        console.log("Source Add Response: " + JSON.stringify(response));
        expect(success).toBe(true);
        expect(response).toBeDefined();
        this.source_id = response.source_id;
        done();
      });
  }, 10000);

  it("should be able to provide a list", function(done) {
    Sources.list(owner, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Source List Response: " + JSON.stringify(response));
      done();
    });
  }, 10000);

  it("should be able to be removed", function(done) {
    expect(this.source_id).toBeDefined();
    Sources.remove(owner, [this.source_id], function(success, response) {
      if (success === false) {
        console.log("Error removing source: " + response);
      }
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Sources Removal Response: " + JSON.stringify(response));
      done();
    });
  }, 10000);

});
