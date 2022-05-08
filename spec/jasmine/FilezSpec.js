/* Router integration test only; does not have to cover full unit functionality. */

var expect = require('chai').expect;

const Filez = require("../../lib/thinx/files");

var envi = require("../_envi.json");

describe("Filez", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running Filez spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Filez spec`);
  });

  it("should provide app's default root", function () {
    let result = Filez.appRoot();
    expect(result).to.be.a('string');
    expect(result).to.equal('/opt/thinx/thinx-device-api');
  });

  it("should provide deploy path for owner's device", function () {
    let result = Filez.deployPathForDevice(envi.owner, envi.udid);
    expect(result).to.be.a('string');
  });

});