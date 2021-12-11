describe("Transfer", function () {

  var expect = require('chai').expect;
  var envi = require("../_envi.json");
  
  var Messenger = require('../../lib/thinx/messenger');
  var messenger = new Messenger().getInstance();

  var Transfer = require("../../lib/thinx/transfer");
  var transfer = new Transfer(messenger);

  it("(00) should be able to initiate device transfer, decline and accept another one", function (done) {

    var body = {
      to: "cimrman@thinx.cloud",
      udids: [envi.udid]
    };
  
    var owner = envi.oid;

    // 00-01 Request
    console.log("(00-1) transfer request A", {owner}, {body});
    transfer.request(owner, body, (t_success, response) => {
      console.log("(00-1) transfer request 1 response", {t_success}, {response});
      expect(t_success).to.be.true;
      expect(response).to.be.a('string');
      const tbody = {
        transfer_id: response.replace("dt:", ""),
        udids: [envi.udid]
      };

      // 00-02 Decline
      transfer.decline(tbody, (d_success, d_response) => {
        console.log("(00-2) transfer decline response: ", {d_success}, { d_response });
        expect(d_success).to.equal(true);
        expect(d_response).to.be.a('string');

        // 00-03 Request
        body.udids = ["d6ff2bb0-df34-11e7-b351-eb37822aa173"];
        console.log("(00-2) transfer request B", {owner}, {body});
        transfer.request(owner, body, (b_success, b_response) => {
          console.log("(00-2) transfer request B response", {b_success}, {b_response});
          expect(b_success).to.be.true;
          expect(b_response).to.be.a('string'); // transfer_requested      

          // 00-04 Accept
          var transfer_body = {
            transfer_id: b_response.replace("dt:", ""),
            udids: [envi.udid]
          };
          console.log("(00-3) transfer accept III", {transfer_body});
          transfer.accept(transfer_body, (success3, response3) => {
            console.log("(00-3) transfer accept III response: ", {success3}, {response3});
            expect(success3).to.be.true; // returns false: transfer_id_not_found
            expect(response3).to.be.a('string');
            done();
          });
        });
      });
    });
  }, 20000); // it-00

}); // describe
