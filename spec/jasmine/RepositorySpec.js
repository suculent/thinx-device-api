var expect = require('chai').expect;
var Repository = require('../../lib/thinx/repository');

// tests are run from ROOT
var repo_path = __dirname;

describe("Repository Watcher", function() {

  var mock_queue = {
    add: function(a1,a2,a3) {
      console.log(`[spec] mock queue add: ${a1} ${a2} ${a3}`);
    }
  };

  var watcher = new Repository(mock_queue);

  watcher.callback = function(err) {
    // watcher exit_callback
    console.log("Callback 1", err);
  };
  watcher.exit_callback = function(err) {
    // watcher exit_callback
    console.log("Callback 2", err);
  };

  console.log("✅ [spec] [info] Watcher is using repo_path: "+repo_path);

  it("should be able to find all repositories", function() {
    let result = Repository.findAllRepositoriesWithFullname("esp");
    expect(result).to.be.an('array');
  });

  it("should be able to find all repositories with search query", function() {
    let result = Repository.findAllRepositoriesWithFullname("esp8266");
    expect(result).to.be.an('array');
  });

  it("should be able to purge old repos", function() {
    watcher = new Repository();
    let name = "esp";
    let repositories = Repository.findAllRepositoriesWithFullname("esp8266");
    watcher.purge_old_repos_with_full_name(repositories, name);
    expect(watcher).to.be.an('object');
  });

  it("should be able to initialize", function() {
    watcher = new Repository(mock_queue);
    expect(watcher).to.be.an('object');
  });

  it("should be able to respond to githook", function() {
    watcher = new Repository(mock_queue);
    let mock_git_message = require("../mock-git-response.json");
    let mock_git_request = {
      headers: [],
      body: mock_git_message
    };
    let response = watcher.process_hook(mock_git_request);
    expect(response).to.be.false; // fix later
  });

});
