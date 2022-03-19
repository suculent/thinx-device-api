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
    expect(Validator.isJSON(mock)).to.be.true;
  });

  it("should return FALSE on invalid JSON", function() {
    expect(Validator.isJSON(invalid_mock)).to.equal(false);
  });
});
