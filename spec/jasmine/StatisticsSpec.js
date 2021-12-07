describe("Statistics", function() {

  var expect = require('chai').expect;
  var Statistics = require('../../lib/thinx/statistics');
  var s = new Statistics();
  s.forceLogPath(__dirname + "/../../spec/test.log");

  var envi = require("../_envi.json");
  var owner = envi.oid;

  it("should be able to initialize", function() {
    expect(s).to.be.a('object');
  });

  it("should be able to store results", function() {
    var path = "/mnt/data/statistics/";
    var dirpath = this.STATS_PATH + owner_id;
    s.write_stats(false, path, dirpath, {
      "message": "example"
    });
  });

  it("should return today path element", function() {
    var result = s.todayPathElement();
    expect(result).to.be.a('string');
  });

  it("should be able to return today results for owner", function(done) {
    s.today(owner, function(success, result) {
        console.log("daily stats: ", { result });
        expect(success).to.be.true;
        expect(result).to.be.a('string');
        done();
      });
  }, 10000);

  it("should be able to aggregate statistics", function(done) {
    s.aggregate(function(success, result) {
      expect(success).to.be.true;
      expect(result).to.be.a('string');
      done();
    });
  }, 10000);

  it("should be able to parse today statistics per owner", function(done) {
    s.today(owner, function(success, body) {
        console.log("Returned today stats: ", { success, body });
        //expect(success).to.be.true;
        expect(body).to.be.a('string');
        done();
      });
  }, 60000);

  it("should be able to parse all statistics per owner", function(done) {
    s.parse(owner, function(success, body) {
        //console.log("Returned all stats: ");
        expect(success).to.be.true;
        if (success) {
          expect(body).to.be.a('object');
        }
        done();
      });
  }, 60000);

  it("should be able to return weekly results for owner", function(done) {
    s.week(owner, function(success, result) {
        //expect(success).to.be.true;
        //console.log("Returned weekly stats: ");
        //console.log({result});
        expect(result).to.be.a('object');
        done();
      });
  }, 10000);

});
