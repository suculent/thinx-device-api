describe("Validator", function() {

  var expect = require('chai').expect;
  var envi = require("../_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;

  var mock = JSON.stringify({ mock: "mock" });
  var invalid_mock = JSON.stringify({ unmock: "mock" })+"€~^&*ż{}";

  // Validator has only static methods
  const Validator = require('../../lib/thinx/validator');

  it("should return TRUE on valid JSON", function() {
    expect(Validator.isJSON(mock)).to.equal(true);
  });

  it("should return FALSE on invalid JSON", function() {
    expect(Validator.isJSON(invalid_mock)).to.equal(false);
  });

  it("should trim invalid owner", function() {
    var result = Validator.owner(owner+owner);
    //console.log("trim invalid owner result: ", result);
    expect(result).to.be.a('string');
    expect(result == owner).to.equal(false);
  });

  it("should return valid owner", function() {
    var result = Validator.owner(owner);
    //console.log("result: ", result);
    //console.log("owner: ", owner);
    expect(result).to.be.a('string');
    expect(result == owner).to.equal(true);
  });

  it("should trim invalid udid", function() {
    var result = Validator.udid(udid+udid);
    //console.log(result);
    expect(result).to.be.a('string');
    expect(result == udid).to.equal(false);
  });

  it("should return valid udid", function() {
    var result = Validator.udid(udid);
    //console.log(result);
    expect(result).to.be.a('string');
    expect(result == udid).to.equal(true);
  });
});
