describe("Transfer", function() {

  var envi = require("./_envi.json");
  var owner = envi.owner;

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
  });

  //decline: function(body, callback) {
  if ("should be able to decline device transfer", function(done) {
      var body = {
        transfer_id: this.dynamic_transfer_request_id,
        udids: [envi.udid]
      };
      Transfer.decline(body, function(success, response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        console.log(JSON.stringify(response));
        done();
      });
    });

  //accept: function(body, callback) {
  if ("should be able to accept transferred devices", function(done) {
      var body = {
        transfer_id: this.dynamic_transfer_request_id,
        udids: [envi.udid]
      };
      Transfer.accept(body, function(success, response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        console.log(JSON.stringify(response));
        done();
      });
    });

});
