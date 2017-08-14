describe("Transfer", function() {

  var envi = require("./_envi.json");
  var owner = envi.oid;

  var Transfer = require("../../lib/thinx/transfer");

  var dynamic_transfer_request_id = null;

  // request: function(owner, body, callback) {
  // body should look like { "to":"some@email.com", "udids" : [ "some-udid", "another-udid" ] }

  it("should be able to initiate device transfer", function(done) {
    var body = {
      to: "cimrman@thinx.cloud",
      udids: [envi.udid]
    };

    Transfer.request(owner, body, function(success, response) {
      console.log(response);
      expect(success).toBe(true);
      expect(response).toBeDefined();
      this.dynamic_transfer_request_id = response;
      done();
    });
  }, 10000);

  //decline: function(body, callback) {
  it("should be able to decline device transfer", function(done) {
    var body = {
      transfer_id: this.dynamic_transfer_request_id,
      udids: [envi.udid]
    };
    Transfer.decline(body, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("transfer decline response: " + JSON.stringify(
        response));
      done();
    });
  }, 5000);

  //accept: function(body, callback) {
  it("should be able to accept transferred devices", function(
    done) {
    var body = {
      transfer_id: this.dynamic_transfer_request_id,
      udids: [envi.udid]
    };
    Transfer.accept(body, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("transfer accept response: " + JSON.stringify(
        response));
      done();
    });
  }, 5000);

});
