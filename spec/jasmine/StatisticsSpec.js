var expect = require('chai').expect;
var Statistics = require('../../lib/thinx/statistics');
var s = new Statistics();
s.forceLogPath(__dirname + "/../../spec/test.log");

var envi = require("../_envi.json");
var owner = envi.oid;

var dateFormat = require("dateformat");

describe("Statistics", function () {

  it("(01) should be able to initialize", function () {
    expect(s).to.be.a('object');
  });

  it("(02) should be able to store results", function () {
    var dirpath = "/mnt/data/statistics/"+owner;
    var filepath = dirpath + owner + "/" + dateFormat(new Date(), "isoDate") + ".json";
    s.write_stats(dirpath, filepath, {
      "owner-data": "example"
    });
  });

  it("(03) should return today path element", function () {
    var result = s.todayPathElement();
    expect(result).to.be.a('string');
  });

  it("(04) should be able to return today results for owner", function (done) {
    s.today(owner, function (success, result) {
      console.log("daily stats: ", { result });
      expect(success).to.be.true;
      expect(result).to.be.a('string');
      done();
    });
  }, 10000);

  it("(05) should be able to aggregate statistics", function (done) {
    s.aggregate(function (success, result) {
      console.log("(05) Returned aggregated statistics: ", {success}, {result});
      //expect(success).to.be.true;
      expect(result).to.be.a('string');
      done();
    });
  }, 10000);

  it("(06) should be able to parse today statistics per owner", function (done) {
    s.today(owner, function (error, path) {
      console.log("(06) Returned today stats: ", {error}, { path });
      //expect(error).to.be.false;
      //expect(path).to.be.a('string'); // link to filename, maybe should return its contents but we don't now from this point
      done();
    });
  }, 60000);

  it("(07) should be able to parse all statistics per owner", function (done) {
    s.parse(owner, function (success, body) {
      console.log("(07) Returned all stats: ", {success}, {body});
      if (success) {
        expect(body).to.be.an('object');
      }
      expect(success).to.be.true;
      done();
    });
  }, 60000);

  it("(08) should be able to return weekly results for owner", function (done) {
    s.week(owner, function (success, result) {
      console.log("Returned weekly: ", {success}, {result});
      expect(result).to.be.an('object');
      done();
    });
  }, 10000);

});
