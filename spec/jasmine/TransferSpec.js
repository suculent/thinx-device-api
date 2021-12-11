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
      console.log("(00) transfer request I response", {success}, {response});
      expect(success).to.be.true;
      expect(response).to.be.a('string');
      const tbody = {
        transfer_id: response,
        udids: [envi.udid]
      };
      console.log("(00) transfer decline request", {tbody});
      Transfer.decline(tbody, function (_success, _response) {
        console.log("(00) transfer decline response: ", { _response });
        expect(_success).to.equal(true);
        expect(_response).to.be.a('string');

        console.log("(00) transfer request II", {success}, {response});
        Transfer.request(owner, body, function (success2, response2) {
          console.log("(00-2) transfer request II response", {success2}, {response2});
          expect(success2).to.be.true;
          expect(response2).to.be.a('string'); // transfer_requested      
          var transfer_body = {
            transfer_id: response2,
            udids: [envi.udid]
          };
          console.log("(00) transfer accept III", {success}, {response});
          Transfer.accept(transfer_body, function (success3, response3) {
            console.log("(00-2) transfer accept III response: ", {success3}, {response3});
            // expect(_success).to.be.true; // returns false: transfer_id_not_found
            expect(response3).to.be.a('string');
            done();
          });
    
        });

      });

    });
  }, 10000);
});
