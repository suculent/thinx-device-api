describe("ACL Manager", function () {

  var ACL = require('../../lib/thinx/acl');
  let Globals = require('../../lib/thinx/globals');
  const redis_client = require('redis');

  let redis;

  beforeAll(async() => {
    console.log(`🚸 [chai] >>> running ACL spec`);
    // Initialize Redis
    redis = redis_client.createClient(Globals.redis_options());
    await redis.connect();
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed ACL spec`);
  });


  // Mock

  const user = "test";
  const topic = "/baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78/<mesh-id>/#";
  const topic_remain = "/baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78/<mesh-id2>/#";

  // ACL files are deprecated in favour of GoAuth
  const input_test_file = '/mnt/data/mosquitto/auth/thinx.acl';
  const output_test_file = '/mnt/data/mosquitto/auth/thinx.out.acl';

  it("should add/update user topic", function (done) {
    var acl = new ACL(redis, "baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78");
    acl.load(() => {
      acl.addTopic(user, "readwrite", topic);
      acl.addTopic(user, "readwrite", topic_remain);
      acl.addTopic(user, "read", topic);
      done();
    });
  });

  it("should be remove user topic by name", function (done) {
    var acl = new ACL(redis, "baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78");
    acl.load(() => {
      acl.addTopic(user, "readwrite", topic_remain);
      acl.removeTopic(user, topic_remain);
      acl.removeTopic(user, "mesh-id");
      done();
    });
  });

  it("should be able export ACL file", function (done) {
    var acl = new ACL(redis, "baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78");
    acl.path = output_test_file;
    acl.commit(() => {
      done();
    });
  });

  it("should be able to prune given topic", function (done) {
    var acl = new ACL(redis, "baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78");
    acl.prune("mesh-id2", () => {
      done();
    });
  });

  it("should be able load ACL file", function (done) {
    var acl = new ACL(redis, "baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78");
    acl.path = input_test_file;
    acl.load(() => {
      done();
    });
  });

  it("should be able load ACL file", function (done) {
    var acl = new ACL(redis, "baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78");
    acl.path = input_test_file;
    acl.load(() => {
      acl.addTopic(user, "read", topic);
      acl.addTopic(user, "readwrite", topic_remain);
      acl.addTopic(user, "write", topic);
      acl.commit(() => {
        done();
      });
    });
  });

  it("should survive start with null/invalidated user", function (done) {
    var acl = new ACL(redis, null);
    acl.path = input_test_file;
    acl.load(() => {
      done();
    });
  });

});
