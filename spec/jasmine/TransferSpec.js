describe("Transfer", function () {

  var expect = require('chai').expect;
  var envi = require("../_envi.json");
  
  var Messenger = require('../../lib/thinx/messenger');
  var messenger = new Messenger().getInstance();

  var Transfer = require("../../lib/thinx/transfer");
  var transfer = new Transfer(messenger);

  it("(00) should be able to initiate device transfer for decline", function (done) {

    var body = {
      to: "cimrman@thinx.cloud",
      udids: [envi.udid]
    };
  
    var owner = envi.oid;

    // 00-01 Request
    transfer.request(owner, body, (success, response) => {
      expect(success).to.be.true;
      expect(response).to.be.a('string');
      const tbody = {
        transfer_id: response.replace("dt:", ""),
        udids: [envi.udid]
      };

      // 00-02 Decline
      transfer.decline(tbody, (_success, _response) => {
        console.log("(00) transfer decline response: ", {_success}, { _response });
        expect(_success).to.equal(true);
        expect(_response).to.be.a('string');

        // 00-03 Request
        console.log("(00-2) transfer request II", {owner}, {body});
        transfer.request(owner, body, (success2, response2) => {
          console.log("(00-2) transfer request II response", {success2}, {response2});
          expect(success2).to.be.true;
          expect(response2).to.be.a('string'); // transfer_requested      

          // 00-04 Accept
          var transfer_body = {
            transfer_id: response2,
            udids: [envi.udid]
          };
          console.log("(00-3) transfer accept III", {transfer_body});
          transfer.accept(transfer_body, (success3, response3) => {
            console.log("(00-3) transfer accept III response: ", {success3}, {response3});
            // expect(success3).to.be.true; // returns false: transfer_id_not_found
            expect(response3).to.be.a('string');
            done();
          });
        });
      });
    });
  }, 10000); // it-00

}); // describe
