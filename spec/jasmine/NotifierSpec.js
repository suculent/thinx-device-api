var Notifier = require('../../lib/thinx/notifier');

describe("Notifier", function () {

  var expect = require('chai').expect;

  let not;

  let buildEnvelope = {
    mock: true
  };

  beforeAll(() => {
    not = new Notifier();
  });

  it("should be able to initialize", function () {
    const notifier = new Notifier();
    expect(notifier).to.be.an('object');
  });

  it("should be able to create notification object for valid build", function() {
    let newStatus = "OK";
    let obj = not.notificationObject(newStatus, buildEnvelope);
    expect(obj.text).to.contain('sucessfully completed');
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

  it ("should return if outfile is undefined"), function(done) {
    let job_status = {};
    not.process_job(job_status, (success) => {
      expect(success).to.be(false);
    });
  });

  it ("should return if no doc with such udid "), function(done) {
    let job_status = {
      udid: "d6ff2bb0-df34-11e7-b351-eb37822aa170"
    };
    not.process_job(job_status, (success) => {
      expect(success).to.be(false);
    });
  });

  it ("should return if udid doc is valid but has no source"), function(done) {
    let job_status = {
      udid: "d6ff2bb0-df34-11e7-b351-eb37822aa172"
    };
    not.process_job(job_status, (success, response) => {
      expect(success).to.be(false);
      console.log("[spec] response:", response);
    });
  });

});
