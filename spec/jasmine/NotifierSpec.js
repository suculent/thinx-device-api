var Notifier = require('../../lib/thinx/notifier');

describe("Notifier", function () {

  var expect = require('chai').expect;

  let not;

  let buildEnvelope = {
    mock: true
  };

  beforeAll(() => {
    console.log(`🚸 [chai] running Notifier spec`);
    not = new Notifier();
  });

  afterAll(() => {
    console.log(`🚸 [chai] completed Notifier spec`);
  });

  it("should be able to initialize", function () {
    const notifier = new Notifier();
    expect(notifier).to.be.an('object');
  });

  it("should be able to create notification object for valid build", function() {
    let newStatus = "OK";
    let obj = not.notificationObject(newStatus, buildEnvelope);
    expect(obj.text).to.contain('successfully completed');
  });

  it("should be able to create notification object for dry-run build", function() {
    let newStatus = "DRY_RUN_OK";
    let obj = not.notificationObject(newStatus, buildEnvelope);
    expect(obj.text).to.contain('left undeployed');
  });

  it("should be able to create notification object for dry-run build", function() {
    let newStatus = "UNKNOWN";
    let obj = not.notificationObject(newStatus, buildEnvelope);
    expect(obj.text).to.contain('has failed');
  });

  it ("should return if outfile is undefined", function(done) {
    let job_status = {};
    not.process(job_status, (success) => {
      expect(success).to.be.false;
      done();
    });
  }, 5000);

  it ("should return if no doc with such udid ", function(done) {
    let job_status = {
      udid: ""
    };
    not.process(job_status, (success) => {
      expect(success).to.be.false;
      done();
    });
  }, 5000);

  it ("should return if udid doc is valid but has no source", function(done) {
    let job_status = {
      udid: "d6ff2bb0-df34-11e7-b351-eb37822aa173"
    };
    not.process(job_status, (success, response) => {
      expect(success).to.be.false;
      console.log("[spec] response:", response);
      done();
    });
  }, 5000);

});
