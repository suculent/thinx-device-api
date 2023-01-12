const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');

const expect = require('chai').expect;
const envi = require("../_envi.json");

const Devices = require("../../lib/thinx/devices");
const Transfer = require("../../lib/thinx/transfer");  
const Messenger = require('../../lib/thinx/messenger');

describe("Transfer", function () {

  let messenger = new Messenger("mosquitto").getInstance("mosquitto");
  let transfer = new Transfer(messenger);

  let redis;
  let devices;

  beforeAll(async(done) => {
    console.log(`🚸 [chai] >>> running Transfer spec`);

    // Initialize Redis
    redis = redis_client.createClient(Globals.redis_options());
    await redis.connect();

    devices = new Devices(messenger, redis);

    devices.list(envi.oid, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
      console.log("[spec] [transfer] BEFORE device list:", JSON.stringify(response, null, 2));
      done();
    });
  });

  afterAll((done) => {
    devices.list(envi.oid, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
      console.log("[spec] [transfer] AFTER device list:", JSON.stringify(response, null, 2));
      done();
    });
    console.log(`🚸 [chai] <<< completed Transfer spec`);
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

  // TODO: Fetch real device-id and do the same thing as specific transfer, then do it over v2 again with two new devices or another owner

}); // describe
