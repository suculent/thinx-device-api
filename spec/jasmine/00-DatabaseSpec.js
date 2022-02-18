describe("Database", function() {

  var Database = require("../../lib/thinx/database");
  var database = new Database();
  
  it("should start and create initial DBs", function(done) {    
    database.init(() => {
      done();
    });
  }, 5000);

});
