describe("Validator", function() {

  var envi = require("./_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;

  // Validator has only static methods
  const Validator = require('../../lib/thinx/validator');

  it("should return TRUE on valid JSON", function() {
    const mock = JSON.stringify({ mock: "mock" });
    expect(Validator.json(mock)).toBe(true);
  });

  it("should return FALSE on invalid JSON", function() {
    const unmock = JSON.stringify({ unmock: "mock" })+"€~^&*ż{}";
    expect(Validator.json(mock)).toBe(false);
  });

  it("should trim invalid owner", function() {
    var result = Validator.owner(owner+owner);
    console.log(result);
    expect(result).toBeDefined();
    expect(result.equals(owner)).toBe(false);
  });

  it("should return valid owner", function() {
    var result = Validator.owner(owner);
    console.log(result);
    expect(result).toBeDefined();
    expect(result.equals(owner)).toBe(true);
  });

  it("should trim invalid udid", function() {
    var result = Validator.udid(udid+udid);
    console.log(result);
    expect(result).toBeDefined();
    expect(result.equals(udid)).toBe(false);
  });

  it("should return valid udid", function() {
    var result = Validator.udid(udid);
    console.log(result);
    expect(result).toBeDefined();
    expect(result.equals(udid)).toBe(true);
  });



});
