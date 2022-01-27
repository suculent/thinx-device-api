var expect = require('chai').expect;
var Repository = require('../../lib/thinx/repository');

// tests are run from ROOT
var repo_path = __dirname;

describe("Repository Watcher", function() {

  var watcher = new Repository();

  console.log("Using repo_path: "+repo_path);

  it("should be able to initialize", function() {
    watcher = new Repository();
    expect(watcher).to.be.an('object');;
  });

  watcher.callback = function(err) {
    // watcher exit_callback
    console.log("Callback 1");
  };
  watcher.exit_callback = function(err) {
    // watcher exit_callback
    console.log("Callback 2");
  };

});
