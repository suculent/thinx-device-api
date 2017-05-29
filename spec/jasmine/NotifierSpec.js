describe("App", function() {

  beforeEach(function() {
    //
  });

  it("should not fail", function(done) {
    var ThinxApp = require('../../notifier.js');
    expect(ThinxApp).toBeDefined();
    done();
  }, 1000);

});
