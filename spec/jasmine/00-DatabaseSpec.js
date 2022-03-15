describe("Database", function () {

  var Database = require("../../lib/thinx/database");
  var database = new Database();

  it("should start and create initial DBs", function (done) {
    database.init((err, result) => {
      expect(err).to.be.null;
      expect(result.length).to.be.a('array');
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

  it("should provide global URI", function (done) {
    database.init((/* err, result */) => {
      let uri = database.uri();
      expect(uri).to.be.a('string');
      done();
    });
  }, 10000);

});
