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
    redis = redis_client.createClient(Globals.redis_options());
    await redis.connect();
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
    watcher.purgeRepositoriesWithFullName(repositories, name);
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

});
