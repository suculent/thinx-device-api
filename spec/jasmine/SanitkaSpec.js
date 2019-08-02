describe("Sanitka", function() {

  var Sanitka = require('../../lib/thinx/sanitka');

  it("should sanitize URLs", function() {
    var s = Sanitka.url("https://github.com/suculent/thinx-device-api/ && ");    
    expect(s).toBe("https://github.com/suculent/thinx-device-api/  ");
  });

  it("should sanitize branches", function() {
    var s = Sanitka.url("origin/master&");    
    expect(s).toBe("origin/master");
  });

});
