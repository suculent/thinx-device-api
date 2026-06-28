const expect = require('chai').expect;
const Repository = require('../../lib/thinx/repository');
const Messenger = require('../../lib/thinx/messenger');
const Queue = require("../../lib/thinx/queue");
const Builder = require('../../lib/thinx/builder');

const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');

// tests are run from ROOT
let repo_path = __dirname;


describe("Repository", function() {

  let messenger;
  let watcher;
  let redis;
  let queue_with_cron;
  let builder;

  beforeAll(async() => {
    console.log(`🚸 [chai] >>> running Repository spec`);
    const redis_base = redis_client.createClient(Globals.redis_options());
    await redis_base.connect();
    redis = redis_base.legacy();
    builder = new Builder(redis);
    queue_with_cron = new Queue(redis, builder, null, null, null);
    watcher = new Repository(messenger, redis, queue_with_cron);
    messenger = new Messenger(redis, "mosquitto").getInstance(redis, "mosquitto");
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Repository spec`);
  });

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
    watcher = new Repository(messenger, redis, queue_with_cron);
    let name = "esp";
    let repositories = Repository.findAllRepositoriesWithFullname("esp8266");
    watcher.purge_old_repos_with_full_name(repositories, name);
    expect(watcher).to.be.an('object');
  });

  it("should be able to initialize", function() {
    watcher = new Repository(messenger, redis, queue_with_cron);
    expect(watcher).to.be.an('object');
  });

  it("should be able to respond to githook", function() {
    watcher = new Repository(messenger, redis, queue_with_cron);
    let mock_git_message = require("../mock-git-response.json");
    let mock_git_request = {
      headers: [],
      body: mock_git_message
    };
    let response = watcher.process_hook(mock_git_request);
    expect(response).to.eq(false); // fix later
  });

  it("should be able to respond to githook (invalid)", function() {
    watcher = new Repository(messenger, redis, queue_with_cron);
    let mock_git_message = require("../mock-git-response.json");
    let mock_git_request = {
      headers: [],
      body: mock_git_message
    };
    delete mock_git_request.body.repository;
    let response = watcher.process_hook(mock_git_request);
    expect(response).to.eq(false); // fix later
  });

  it ("should be able to verify body signature", () => {
    let result = watcher.validateSignature("sha256=null", "{ body: false }", "secret");
    expect(result).to.eq(false);
  });

  // Behavior-locking assertions for findDirsSync (Cases C, C2)
  it("findDirsSync finds .git directories including dotfiles", function () {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const { findDirsSync } = require('../../lib/thinx/finder');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-spec-c-'));
    try {
      // Create myrepo/.git inside the temp dir
      const gitDir = path.join(tmpRoot, 'myrepo', '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      const result = findDirsSync(tmpRoot, '.git', true, true);
      expect(result).to.be.an('array');
      expect(result.length).to.be.at.least(1);
      expect(result[0]).to.match(/\/\.git$/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("Repository.findAllRepositories returns .git paths (dotfile flag survives into production)", function () {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const app_config = Globals.app_config();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-spec-c2-'));
    const origDataRoot = app_config.data_root;
    const origBuildRoot = app_config.build_root;
    try {
      // Create myrepo/.git inside the temp dir
      const gitDir = path.join(tmpRoot, 'myrepo', '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      // Point repositories_path = data_root + build_root → tmpRoot
      app_config.data_root = tmpRoot;
      app_config.build_root = '';
      const result = Repository.findAllRepositories();
      expect(result).to.be.an('array');
      expect(result.length).to.be.at.least(1);
      const hasGitPath = result.some(p => p.endsWith('/.git'));
      expect(hasGitPath).to.equal(true);
    } finally {
      app_config.data_root = origDataRoot;
      app_config.build_root = origBuildRoot;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

});
