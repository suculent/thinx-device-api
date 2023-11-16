const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');

const expect = require('chai').expect;
const envi = require("../_envi.json");

const Devices = require("../../lib/thinx/devices");
const Transfer = require("../../lib/thinx/transfer");  
const Messenger = require('../../lib/thinx/messenger');

describe("Transfer", function () {

  let messenger;
  let transfer;
  let redis;
  let devices;

  beforeAll(async() => {
    console.log(`🚸 [chai] >>> running Transfer spec`);

    // Initialize Redis
    redis = redis_client.createClient(Globals.redis_options());
    await redis.connect();

    transfer = new Transfer(messenger, redis);

    devices = new Devices(messenger, redis);

    messenger = new Messenger(redis, "mosquitto").getInstance(redis, "mosquitto");

    devices.list(envi.oid, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
    });
  });

  afterAll((done) => {
    devices.list(envi.oid, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
      done();
    });
    console.log(`🚸 [chai] <<< completed Transfer spec`);
  });

  it("(00) should be able to initiate device transfer, decline and accept another one", async function () {

    var body = {
      to: "cimrman@thinx.cloud",
      udids: [envi.udid]
    };
  
    var owner = envi.oid;

    // create transfer request
    let response = await transfer.request(owner, body); // should return transfer_id without prefix

    console.log("[spec] CHECKME! transfer request response:", response);
      
    expect(response).to.be.a('string'); // DTID
    
    let tbody = {
      transfer_id: response.replace("dt:", ""),
      udids: [envi.udid]
    };

    // 00-02 Decline
    await transfer.decline(tbody).catch((e) => {
      // may throw various exceptions, like `invalid_device_transfer_identifier`
      expect(e.indexOf("invalid_device_transfer_identifier") !== -1);
      console.log("[spec] CHECKME! exception", e); 
    });
    //expect(d_response).to.be.a('string');

    let b_response = await transfer.request(owner, body);
    expect(b_response).to.be.a('string'); // transfer_requested

    // 00-04 Accept
    var transfer_body = {
      transfer_id: b_response.replace("dt:", ""),
      udids: [envi.udid]
    };

    const response3 = await transfer.accept(transfer_body).catch((e) => {
      console.log("[spec] transfer.accept throws:", e);
    });
    console.log("[spec] transfer.accept response3:", response3);
    expect(response3).to.be.a('string');
  }); // it-00

  // TODO: Fetch real device-id and do the same thing as specific transfer, then do it over v2 again with two new devices or another owner

}); // describe
