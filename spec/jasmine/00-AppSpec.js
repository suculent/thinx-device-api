const THiNX = require("../../thinx-core.js");

describe("App", function () {

  it("App class should not fail.", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      done();
    });
  }, 20000);

  it("App start should not fail.", function() {
    require('../../thinx.js');
  });

});
