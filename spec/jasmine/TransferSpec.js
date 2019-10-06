describe("Transfer", function() {

  var envi = require("../_envi.json");
  var owner = envi.oid;

  var Messenger = require('../../lib/thinx/messenger');
  var messenger = new Messenger().getInstance();

  var transfer = require("../../lib/thinx/transfer");
  var Transfer = new transfer(messenger);

  var dynamic_transfer_request_id = null;

  var body = {
    to: "cimrman@thinx.cloud",
    udids: [envi.udid]
  };

  // request: function(owner, body, callback) {
  // body should look like { "to":"some@email.com", "udids" : [ "some-udid", "another-udid" ] }

  it("should be able to initiate device transfer for decline", function(
    done) {

    Transfer.request(this.owner, body, function(success, response) {
      console.log(response);
      expect(success).toBe(true);
      expect(response).toBeDefined();
      dynamic_transfer_request_id = response;
      done();

    });
  }, 10000);

  //decline: function(body, callback) {
  it("should be able to decline device transfer", function(done) {
    const tbody = {
      transfer_id: dynamic_transfer_request_id,
      udids: [envi.udid]
    };
    Transfer.decline(tbody, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("transfer decline response: " + JSON.stringify(
        response));
      done();
    });
  }, 5000);

  it("should be able to initiate device transfer for accept", function(done) {
    Transfer.request(this.owner, body, function(success, response) {
      console.log(response);
      expect(success).toBe(true);
      expect(response).toBeDefined();
      dynamic_transfer_request_id = response;
      done();
    });
  }, 10000);

  //accept: function(body, callback) {
  it("should be able to accept transferred devices", function(
    done) {
    var transfer_body = {
      transfer_id: dynamic_transfer_request_id,
      udids: [envi.udid]
    };
    Transfer.accept(transfer_body, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("transfer accept response: " + JSON.stringify(
        response));
      done();
    });
  }, 5000);
});
