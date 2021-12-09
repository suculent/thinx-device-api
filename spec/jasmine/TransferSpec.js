describe("Transfer", function () {

  var expect = require('chai').expect;
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

  it("(01) should be able to initiate device transfer for decline", function (done) {

    Transfer.request(owner, body, function (success, response) {
      console.log("transfer decline request response", response);
      expect(success).to.be.true;
      expect(response).to.be.a('string');
      dynamic_transfer_request_id = response;
      const tbody = {
        transfer_id: dynamic_transfer_request_id,
        udids: [envi.udid]
      };
      Transfer.decline(tbody, function (_success, _response) {
        expect(_success).to.equal(false);
        expect(_response).to.be.a('string');
        console.log("transfer decline response: ", { _response });
        done();
      });

    });
  }, 10000);


  it("(02) should be able to initiate device transfer for accept and then accept transfer", function (done) {
    Transfer.request(owner, body, function (success, response) {
      console.log("transfer accept request response", response);
      expect(success).to.be.true;
      expect(response).to.be.a('string'); // transfer_requested
      dynamic_transfer_request_id = response;
      
      var transfer_body = {
        transfer_id: dynamic_transfer_request_id,
        udids: [envi.udid]
      };
      Transfer.accept(transfer_body, function (_success, _response) {
        console.log("transfer accept response: ", {_success}, {_response});
        expect(success_).to.be.true;
        expect(_response).to.be.a('string');
        done();
      });

    });
  }, 10000);
});
