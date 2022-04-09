describe("Transfer", function () {

  var expect = require('chai').expect;
  var envi = require("../_envi.json");
  
  var Messenger = require('../../lib/thinx/messenger');
  var messenger = new Messenger("mosquitto").getInstance("mosquitto");

  var Devices = require("../../lib/thinx/devices");
  var devices = new Devices(messenger);

  var Transfer = require("../../lib/thinx/transfer");
  var transfer = new Transfer(messenger);

  beforeAll((done) => {
    console.log(`🚸 [chai] running Transfer spec`);
    devices.list(envi.oid, (success, response) => {
      expect(success).to.be.true;
      expect(response).to.be.a('object');
      console.log("[spec] [transfer] BEFORE device list:", JSON.stringify(response, null, 2));
      done();
    });
  });

  afterAll(() => {
    console.log(`🚸 [chai] completed Transfer spec`);
  });

  it("(00) should be able to initiate device transfer, decline and accept another one", function (done) {

    let accepted = false;

    var body = {
      to: "cimrman@thinx.cloud",
      udids: [envi.udid]
    };
  
    var owner = envi.oid;

    // TODO: Turn this into async
    transfer.request(owner, body, (t_success, response) => {
      expect(t_success).to.equal(true);
      expect(response).to.be.a('string');
      const tbody = {
        transfer_id: response.replace("dt:", ""),
        udids: [envi.udid]
      };

      // 00-02 Decline
      transfer.decline(tbody, (d_success, d_response) => {
        expect(d_success).to.equal(true);
        expect(d_response).to.be.a('string');

        // TODO: Turn this into async
        transfer.request(owner, body, (b_success, b_response) => {
          expect(b_success).to.equal(true);
          expect(b_response).to.be.a('string'); // transfer_requested      

          // 00-04 Accept
          var transfer_body = {
            transfer_id: b_response.replace("dt:", ""),
            udids: [envi.udid]
          };

          // asyncCall
          transfer.accept(transfer_body, (success3, response3) => {
            expect(success3).to.equal(true);
            expect(response3).to.be.a('string');
            if (!accepted) {
              accepted = true;
              done();
            }
          });
        });
      });
    });
  }); // it-00

}); // describe
