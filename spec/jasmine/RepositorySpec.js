describe("Repository Watcher", function() {

  var expect = require('chai').expect;
  var Watcher = require('../../lib/thinx/repository');
  var watcher = new Watcher();

  // tests are run from ROOT
  var repo_path = __dirname;

  console.log("Using repo_path: "+repo_path);

  watcher.callback = function(err) {
    // watcher exit_callback
    console.log("Callback 1");
  };
  watcher.exit_callback = function(err) {
    // watcher exit_callback
    console.log("Callback 2");
  };

  beforeEach(function() {
    //watcher = new Watcher();
  });

  it("should be able to initialize", function() {
    expect(watcher).to.be.a('object');
  });

});
