describe("Statistics", function() {

  var s = require('../../lib/thinx/statistics');

  var envi = require("./_envi.json");
  var owner = envi.oid;

  it("should be able to initialize", function() {
    expect(s).toBeDefined();
  });

  it("should be able to store results", function() {
    var path =
      "./statistics/" + owner + "/" +
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
      owner,
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

  it("should be able to parse today statistics per owner", function(done) {
    s.parse(
      owner,
      true,
      function(err, body) {
        console.log(err, body);
        expect(body).toBe(true);
        done();
      });
  }, 60000);

  it("should be able to parse all statistics per owner", function(done) {
    s.parse(
      owner,
      false,
      function(err, body) {
        console.log(err, body);
        expect(body).toBe(true);
        done();
      });
  }, 60000);

  it("should be able to return weekly results for owner", function(done) {
    var result = s.week(
      owner,
      function(error, result) {
        expect(error).toBe(false);
        console.log("weekly stats: " + result);
        expect(result).toBeDefined();
        done();
      });
  }, 10000);

});
