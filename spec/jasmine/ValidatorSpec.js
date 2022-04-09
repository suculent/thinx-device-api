describe("Validator", function() {

  beforeAll(() => {
    console.log(`🚸 [chai] running Validator spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] completed Validator spec`);
  });

  var expect = require('chai').expect;
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
});
