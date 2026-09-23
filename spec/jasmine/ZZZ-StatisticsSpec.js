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
    const dirpath = "/mnt/data/statistics/"+owner;
    const filepath = dirpath + owner + "/" + dateFormat(new Date(), "isoDate") + ".json";
    s.write_stats(dirpath, filepath, {
      "owner-data": "example"
    });
  });

  it("(03) should return today path element", function () {
    var result = s.todayPathElement();
    expect(result).to.be.a('string');
  });

  it("(04) should not be able to return today results for owner before aggregation", function (done) {
    s.today(owner, function (success, result) {
      expect(success).to.equal(true); 
      expect(result).to.be.a('string');
      done();
    });
  }, 10000);

  it("(05) should be able to aggregate statistics", function (done) {
    s.aggregate(function (success, result) {
      expect(success).to.equal(true);
      expect(result).to.be.a('string');
      done();
    });
  }, 10000);

  it("(06) should be able to parse all statistics per owner", function (done) {
    s.parse(owner, function (success, body) {
      expect(body).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 60000);

  it("(07) should be able to return weekly results for owner", function (done) {
    s.week(owner, function (success, result) {
      expect(success).to.equal(true);
      expect(result).to.be.an('object');
      done();
    });
  }, 10000);

  it("(08) should be able to return today results for owner after aggregation", function (done) {
    s.today(owner, function (success, result) {
      console.log("(08)", success, result);
      expect(success).to.equal(true);
      expect(result).to.be.a('string');
      done();
    });
  }, 10000);

  // parse_oid() used to re-seed the owner template on every matching line, so
  // parse_line()'s increments were discarded and each owner ended the run with
  // only the last matching line counted.
  it("(09) should accumulate event counters across lines", function () {
    const EventTaxonomy = require('../../lib/thinx/event_taxonomy');
    const fresh = new Statistics();
    fresh.owners = {}; fresh.owners[owner] = EventTaxonomy.templateModel();

    const lines = [
      "[OID:" + owner + "] DEVICE_CHECKIN",
      "[OID:" + owner + "] DEVICE_CHECKIN",
      "[OID:" + owner + "] DEVICE_CHECKIN",
      "[OID:" + owner + "] BUILD_SUCCESS"
    ];
    lines.forEach((line) => fresh.parse_oid(line));

    expect(fresh.owners[owner].DEVICE_CHECKIN[0]).to.equal(3);
    expect(fresh.owners[owner].BUILD_SUCCESS[0]).to.equal(1);
  });

  // OIDs that are not in the user database must be ignored, not created.
  it("(10) should ignore lines for unknown owners", function () {
    const EventTaxonomy = require('../../lib/thinx/event_taxonomy');
    const unknown = "a".repeat(64);
    const fresh = new Statistics();
    fresh.owners = {}; fresh.owners[owner] = EventTaxonomy.templateModel();

    fresh.parse_oid("[OID:" + unknown + "] DEVICE_CHECKIN");
    fresh.parse_oid("[OID:not-an-oid] DEVICE_CHECKIN");

    expect(fresh.owners[unknown]).to.equal(undefined);
    expect(fresh.owners[owner].DEVICE_CHECKIN[0]).to.equal(0);
  });

});
