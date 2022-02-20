describe("Database", function () {

  var Database = require("../../lib/thinx/database");
  var database = new Database();

  it("should start and create initial DBs", function (done) {
    database.init((err, result) => {
      console.log("DB init test err, result", err, result); // remove after turning to expect
      done();
    });
  }, 5000);

  it("should run compactor", function (done) {
    database.compactDatabases((success) => {
      expect(success).toBe.be.true;
      done();
    });
  }, 10000);

});
