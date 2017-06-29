describe("Statistics", function() {

  var s = require('../../lib/thinx/statistics');

  it("should be able to initialize", function() {
    expect(s).toBeDefined();
  });

  it("should be able to store results", function() {
    var path =
      "./statistics/eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f/" +
      s.todayPathElement() + ".json";
    s.write_stats(false, path, "./statistics", {
      "message": "test"
    });
  });

  it("should return today path element", function() {
    var s = require('../../lib/thinx/statistics');
    var result = s.todayPathElement();
    console.log(result);
    expect(result).toBeDefined();
  });

  it("should be able to return today results for owner", function(done) {
    var result = s.today(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(error, result) {
        expect(error).toBe(false);
        console.log("daily stats: " + result);
        expect(result).toBeDefined();
        done();
      });
  }, 10000);

  it("should be able to aggregate statistics", function(done) {
    var result = s.aggregate();
    expect(result).toBe(true);
    done();
  }, 10000);

  it("should be able to parse statistics per owner", function(done) {
    s.parse(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(err, body) {
        console.log(err, body);
        expect(body).toBe(true);
        done();
      });
  }, 60000);

  it("should be able to return weekly results for owner", function(done) {
    var result = s.week(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(error, result) {
        expect(error).toBe(false);
        console.log("weekly stats: " + result);
        expect(result).toBeDefined();
        done();
      });
  }, 10000);

});
