var expect = require('chai').expect;
var Repository = require('../../lib/thinx/repository');

// tests are run from ROOT
var repo_path = __dirname;

describe("Repository Watcher", function() {

  var watcher = new Repository();

  watcher.callback = function(err) {
    // watcher exit_callback
    console.log("Callback 1", err);
  };
  watcher.exit_callback = function(err) {
    // watcher exit_callback
    console.log("Callback 2", err);
  };

  console.log("[test] Watcher is using repo_path: "+repo_path);

  it("should be able to initialize", function() {
    watcher = new Repository();
    expect(watcher).to.be.an('object');
  });

  it("should be able to find all repositories", function() {
    let result = Repository.findAllRepositoriesWithFullname("esp");
    expect(result).to.be.an('array');
  });

  it("should be able to find all repositories with search query", function() {
    let result = Repository.findAllRepositoriesWithFullname("32");
    expect(result).to.be.an('array');
  });

  it("should be able to purge old repos", function() {
    watcher = new Repository();
    let repositories = "/device-folders-todo"
    let name = "esp";
    watcher.purge_old_repos_with_full_name(repositories, name)
    expect(watcher).to.be.an('object');
  });

  it("should be able to respond to githook", function() {
    watcher = new Repository();
    let mock_git_message = require("../mock-git-response.json");
    let response = watcher.process_hook(mock_git_message);
    expect(response).to.be.false; // fix later
  });

});
