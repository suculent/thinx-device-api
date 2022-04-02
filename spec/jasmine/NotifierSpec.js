var Notifier = require('../../lib/thinx/notifier');

describe("Notifier", function () {

  var expect = require('chai').expect;

  it("should be able to initialize", function () {

    const notifier = new Notifier();
    expect(notifier).to.be.an('object');

  });

});
