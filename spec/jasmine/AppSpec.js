describe("App", function() {

  it("should not fail", function(done) {
    var ThinxApp = require('../../index.js');
    expect(ThinxApp).toBeDefined();
    done();
  }, 20000);

});
