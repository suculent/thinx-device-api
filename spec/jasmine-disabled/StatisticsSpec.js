describe("Statistics", function() {

  var Statistics = require('../../lib/thinx/statistics');
  var s = new Statistics();
  s.forceLogPath(__dirname + "/../../spec/test.log");

  var envi = require("../_envi.json");
  var owner = envi.oid;

  it("should be able to initialize", function() {
    expect(s).toBeDefined();
  });

  it("should be able to store results", function() {
    var path = __dirname + "/../../statistics/" + owner + "/" + s.todayPathElement() + ".json";
    s.write_stats(false, path, __dirname + "/../../statistics/", {
      "message": "test"
    });
  });

  it("should return today path element", function() {
    var result = s.todayPathElement();
    //console.log(result);
    expect(result).toBeDefined();
  });

  it("should be able to return today results for owner", function(done) {
    s.today(owner, function(success, result) {
        // expect(success).toBe(true);
        console.log("daily stats: ", { result });
        expect(result).toBeDefined();
        done();
      });
  }, 10000);

  it("should be able to aggregate statistics", function(done) {
    s.aggregate(function(success, result) {
      expect(success).toBe(true);
      expect(result).toBeDefined();
      done();
    });
  }, 10000);

  it("should be able to parse today statistics per owner", function(done) {
    s.today(owner, function(success, body) {
        console.log("Returned today stats: ", { success, body });
        //expect(success).toBe(true);
        expect(body).toBeDefined();
        done();
      });
  }, 60000);

  it("should be able to parse all statistics per owner", function(done) {
    s.parse(owner, function(success, body) {
        //console.log("Returned all stats: ");
        expect(success).toBe(true);
        if (success) {
          expect(body).toBeDefined();
        }
        done();
      });
  }, 60000);

  it("should be able to return weekly results for owner", function(done) {
    s.week(owner, function(success, result) {
        //expect(success).toBe(true);
        //console.log("Returned weekly stats: ");
        //console.log({result});
        expect(result).toBeDefined();
        done();
      });
  }, 10000);

});
