describe("ACL Manager", function () {

  var ACL = require('../../lib/thinx/acl');
  var acl = new ACL("baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78");

  // Mock

  const user = "test";
  const topic = "/baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78/<mesh-id>/#";
  const topic_remain = "/baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78/<mesh-id2>/#";
  const input_test_file = '/mnt/data/mosquitto/auth/thinx.acl';
  const output_test_file = '/mnt/data/mosquitto/auth/thinx.out.acl';

  it("should add/update user topic", function () {
    acl.addTopic(user, "readwrite", topic);
    acl.addTopic(user, "readwrite", topic_remain);
    acl.addTopic(user, "read", topic);
  });

  it("should be remove all user topics by name", function () {
    acl.removeTopic(user, topic);
  });

  it("should be able export ACL file", function (done) {
    acl.path = output_test_file;
    acl.commit(() => {
      done();
    });
  });

  it("should be able to prune given topic", function (done) {
    acl.prune("mesh-id2", () => {
      done();
    });
  });

  it("should be able load ACL file", function (done) {
    acl.path = input_test_file;
    acl.load(() => {
      done();
    });
  });

});
