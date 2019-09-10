describe("Repository Watcher", function() {

  var Watcher = require('../../lib/thinx/repository');
  var watcher = new Watcher();

  // tests are run from ROOT
  var repo_path = __dirname;

  console.log("Using repo_path: "+repo_path);

  var watcher_callback = function(result) {
    if (typeof(result) !== "undefined") {
      console.log("watcher_callback result: " + JSON.stringify(result));
      if (result === false) {
        console.log(
          "No change detected on repository so far."
        );
      } else {
        console.log(
          "CHANGE DETECTED! - TODO: Commence re-build (will notify user but needs to get all required user data first (owner/device is in path)"
        );
      }
    } else {
      console.log("watcher_callback: no result");
    }
    expect(true).toBe(true);
  };

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
    expect(watcher).toBeDefined();
  });

  it("should be able to infer platform from repository contents", function(done) {
    console.log("Inferring at " + repo_path);
    watcher.getPlatform(repo_path, function(error, result) {
      expect(result).toBeDefined();
      console.log("Platform: " + result);
      done();
    });
  }, 15000);

  it("should be able tell repository has changed", function() {
    watcher.checkRepositoryChange(repo_path, false, function(status, result) {
      expect(result).toBeDefined();
      console.log("Repository change result: " + result);
    });
  });

  it("should be able to get revision", function() {
    var r = watcher.getRevision();
    expect(r).toBeDefined();
  });

  it("should be able to get revision number", function() {
    var n = watcher.getRevisionNumber();
    expect(n).toBeDefined();
  });

});
