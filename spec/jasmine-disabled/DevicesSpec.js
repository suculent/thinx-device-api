const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');

const expect = require('chai').expect;
  
const Messenger = require('../../lib/thinx/messenger');

const Devices = require("../../lib/thinx/devices");
const Device = require("../../lib/thinx/device");

const envi = require("../_envi.json");
const owner = envi.oid;
const source_id = envi.sid;
const ak = envi.ak;

describe("Devices", function() {

  let messenger = new Messenger("mosquitto").getInstance("mosquitto");
  
  let redis;
  let devices;
  let device;

  beforeAll(async() => {
    console.log(`🚸 [chai] >>> running Devices spec`);
    // Initialize Redis
    redis = redis_client.createClient(Globals.redis_options());
    await redis.connect();
    devices = new Devices(messenger, redis);
    device = new Device(redis);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Devices spec`);
  });

  // This UDID is to be deleted at the end of test.
  var TEST_DEVICE = {
    mac: "AA:BB:CC:EE:00:03",
    firmware: "DevicesSpec.js",
    version: "1.0.0",
    checksum: "alevim",
    push: "forget",
    alias: "virtual-test-device-3-dynamic",
    owner: "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c",
    platform: "arduino"
  };

  var TEST_DEVICE4 = {
    mac: "AA:BB:CC:DD:DD:DD",
    firmware: "DevicesSpec.js",
    version: "1.0.0",
    checksum: "alevim",
    push: "forget",
    alias: "virtual-test-device-4-deleteme",
    owner: "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c",
    platform: "arduino"
  };

  let res = { info: "mock" };

  it("(01) should be able to register sample device", function(done) {
    device.register(
      TEST_DEVICE, /* reg.registration */
      ak,
      res,
      (_r, success, response) => {
        TEST_DEVICE.udid = response.registration.udid;
        expect(success).to.equal(true);
        expect(TEST_DEVICE).to.be.an('object');
        expect(response.registration).to.be.an('object');
        expect(TEST_DEVICE.udid).to.be.a('string');
        done();
      });
  }, 15000); // register

  // All of this expects successful device registration to safely revoke!
  
  it("(02) should be able to list devices for owner", function(done) {
    devices.list(owner, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
      done();
    });
  }, 5000);

  it("(03) should not be able to list devices for empty owner", function(done) {
    devices.list("", (success, response) => {
      expect(success).to.be.false;
      expect(response).to.be.a('object');
      done();
    });
  }, 5000);

  it("(04) should be able to attach repository to device(s)", function(done) {
    var body = {
      source_id: source_id,
      udid: TEST_DEVICE.udid
    };
    devices.attach(owner, body, (_res, success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('string');
      done();
    }, {});
  }, 30000);

  it("(05) should be able to detach repository from device", function(done) {
    var body = {
      udid: TEST_DEVICE.udid
    };
    devices.detach(body, (_res, success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('string');
      expect(response).to.equal('detached');
      done();
    }, {});
  }, 30000);

  it("(06) should be able to revoke another sample device", function(done) {
    device.register(
      TEST_DEVICE4, /* reg.registration */
      ak,
      res,
      (_r, success, response) => {
        TEST_DEVICE4.udid = response.registration.udid;
        expect(success).to.equal(true);
        var body = {
          udid: TEST_DEVICE4.udid
        };
        devices.revoke(owner, body, (_res, _success, _response) => {
          expect(_success).to.equal(true);
          expect(_response).to.be.a('string');
          done();
        }, res);
      });
  }, 15000); // register
});
