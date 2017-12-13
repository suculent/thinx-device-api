describe("App", function() {

  it("should not fail", function(done) {
    require('../../index.js');
    var thx = new ThinxApp();
    expect(thx).toBeDefined();
    done();
  }, 20000);

});
