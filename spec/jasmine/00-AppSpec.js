const THiNX = require("../../thinx-core.js");

describe("App", function () {

  it("App start should not fail.", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      done();
    });
  }, 20000);

});
