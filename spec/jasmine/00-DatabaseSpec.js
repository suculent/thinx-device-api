describe("Database", function () {

  var Database = require("../../lib/thinx/database");
  var database = new Database();

  it("should provide global URI", function (done) {
    database.init((/* err, result */) => {
      const uri = database.uri();
      expect(uri).toBe.be.a('string');
      done();
    });
  }, 10000);

  it("should start and create initial DBs", function (done) {
    database.init((err, result) => {
      console.log("DB init test err, result", err, result); // remove after turning to expect
      //expect(err).to.be.null;
      //expect(result.length).to.be(7);
      done();
    });
  }, 5000);

  it("should run compactor", function (done) {
    database.init((/* err, result */) => {
      database.compactDatabases((/* success */) => {
        done();
      });
    });
  }, 10000);

});
