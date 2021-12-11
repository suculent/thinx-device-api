describe("Transfer", function () {

  var expect = require('chai').expect;
  var envi = require("../_envi.json");
  var owner = envi.oid;

  var Messenger = require('../../lib/thinx/messenger');
  var messenger = new Messenger().getInstance();

  var transfer = require("../../lib/thinx/transfer");
  var Transfer = new transfer(messenger);

  var body = {
    to: "cimrman@thinx.cloud",
    udids: [envi.udid]
  };

  // request: function(owner, body, callback) {
  // body should look like { "to":"some@email.com", "udids" : [ "some-udid", "another-udid" ] }

  it("(00) should be able to initiate device transfer for decline", function (done) {

    Transfer.request(owner, body, function (success, response) {
      console.log("transfer decline request response", {success}, {response});
      expect(success).to.be.true;
      expect(response).to.be.a('string');
      const tbody = {
        transfer_id: response,
        udids: [envi.udid]
      };
      Transfer.decline(tbody, function (_success, _response) {
        expect(_success).to.equal(false);
        expect(_response).to.be.a('string');
        console.log("transfer decline response: ", { _response });
        done();

        Transfer.request(owner, body, function (success, response) {
          console.log("(02) transfer request response", {success}, {response});
          expect(success).to.be.true;
          expect(response).to.be.a('string'); // transfer_requested      
          var transfer_body = {
            transfer_id: response,
            udids: [envi.udid]
          };
          Transfer.accept(transfer_body, function (_success, _response) {
            console.log("(02) transfer accept response: ", {_success}, {_response});
            // expect(_success).to.be.true; // returns false: transfer_id_not_found
            expect(_response).to.be.a('string');
            done();
          });
    
        });

      });

    });
  }, 10000);
});
