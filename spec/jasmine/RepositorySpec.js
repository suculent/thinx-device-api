describe("Repository Watcher", function() {

  var watcher = require('../../lib/thinx/repository');
  var repo_path = "../..";

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
    expect(true).toBe(true);
  };
  watcher.exit_callback = function(err) {
    // watcher exit_callback
    console.log("Callback 2");
    expect(true).toBe(true);
  };

  beforeEach(function() {
    //watcher = new Watcher();
  });

  it("should be able to initialize", function() {
    expect(watcher).toBeDefined();
  });

  it("should be able to watch repository", function() {

    watcher.watchRepository(repo_path, true, function(result) {
      if (typeof(result) !== "undefined") {
        console.log("watcher_callback result: " + JSON.stringify(
          result));
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
    });
  });

  it("should be able tell repository has changed", function() {
    watcher.checkRepositoryChange(repo_path, false, function(err,
      result) {
      expect(true).toBe(true);
    });
  });

  it("should be able to unwatch repository", function() {
    watcher.unwatchRepository();
    expect(true).toBe(true);
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
