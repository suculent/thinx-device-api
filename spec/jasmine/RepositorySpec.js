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

  it("should be able tell repository has changed", function() {
    watcher.checkRepositoryChange(repo_path, false, function(status, result) {
      expect(status).to.be.a('object');
      console.log("Repository change status: ", {status});
    });
  });

  it("should be able to get revision", function() {
    var r = watcher.getRevision();
    expect(r).to.be.a('string');
  });

  it("should be able to get revision number", function() {
    var n = watcher.getRevisionNumber();
    expect(n).to.be.a('number');
  });

});
