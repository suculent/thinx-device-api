const expect = require('chai').expect;

const Messenger = require('../../lib/thinx/messenger');
let messenger;

const Device = require("../../lib/thinx/device");

const envi = require("../_envi.json");
let test_owner = envi.oid;
let udid = envi.udid;

let Owner = require("../../lib/thinx/owner");

const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');

describe("Messenger", function () {

  let user;
  let device;
  let redis;

  beforeAll(async () => {
    console.log(`🚸 [chai] >>> running Messenger spec`);
    // Initialize Redis
    const redis_base = redis_client.createClient(Globals.redis_options());
    await redis_base.connect();
    redis = redis_base.legacy();
    user = new Owner(redis);
    device = new Device(redis);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Messenger spec`);
  });

  let ak = envi.ak;

  // This UDID is to be deleted at the end of test.
  let TEST_DEVICE_6 = {
    mac: "AA:BB:CC:EE:00:06",
    firmware: "MessengerSpec.js",
    version: "1.0.0",
    checksum: "alevim",
    push: "forget",
    alias: "virtual-test-device-6-messenger",
    owner: test_owner,
    platform: "platformio"
  };

  it("requires to register sample build device", function (done) {
    let res = {};
    device.register(
      TEST_DEVICE_6, /* reg.registration */
      ak,
      res,
      (r, success, response) => {
        TEST_DEVICE_6.udid = response.registration.udid;
        expect(success).to.equal(true);
        expect(TEST_DEVICE_6).to.be.a('object');
        expect(response.registration).to.be.a('object');
        expect(TEST_DEVICE_6.udid).to.be.a('string');
        done();
      });
  }, 30000); // register


  it("should be able to initialize", function (/* done */) {
    messenger = new Messenger(redis, "mosquitto").getInstance(redis, "mosquitto");
  });

  // this requires having owner and devices registered in the DB, 
  it("should be able to initialize with owner", function (done) {
    // const mock_socket = {}; let socket = app._ws[owner]; - websocket should be extracted to be instantiated on its own
    console.log("✅ [spec]  Initializing messenger with owner", test_owner, "mock_socket", null);
    messenger.initWithOwner(test_owner, null, (success, status) => {
      console.log("✅ [spec] messenger initialized: ", { success: success, status: status });
      expect(success).to.equal(true);
      done();
    });
  }, 60000);

  // publish: function(owner, udid, message); returns nothing
  it("should be able to publish upon connection", function (done) {
    messenger.publish(test_owner, udid, "test");
    done();
  }, 5000);

  // may be disabled in case of last test left hanging
  it("[mm] should be able to setup MQTT client", function (done) {

    const Globals = require("../../lib/thinx/globals.js");
    const app_config = Globals.app_config();

    console.log(`[spec] [mm] [debug] getting apikey with config ${JSON.stringify(app_config.mqtt)} for ${test_owner}`);

    user.mqtt_key(test_owner, (key_success, apikey) => {

      // to debug Default MQTT API Key creation: 

      console.log(`[spec] [mm] fetched mqtt key? ${key_success} with apikey ${JSON.stringify(apikey, null, '\t')}`);

      expect(key_success).to.equal(true);
      expect(apikey).to.be.a('object');

      let mqtt_options = {
        host: app_config.mqtt.server,
        port: app_config.mqtt.port,
        username: test_owner,
        password: apikey.key
      };

      console.log(`[spec] [mm] setting up client for owner ${test_owner} with options ${JSON.stringify(mqtt_options)}`);

      messenger.setupMqttClient(test_owner, mqtt_options, (result) => {
        console.log(`[spec] [mm] [spec] setup mqtt result ${result}`);
        expect(result).to.equal(true);
        done();
      });

    });

  }, 5000);

  // responder should not fail
  it("should be able to respond to a nonsense message", function () {
    let topic = "/owner/device/test";
    let message = "Bare no-NID message";
    messenger.messageResponder(topic, message);
  });

  it("should be able to process status connected message", function () {
    let topic = "/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172/status";
    let message = {
      status: "connected"
    };
    messenger.messageResponder(topic, message);
  });

  it("should be able to process status disconnected message", function () {
    let topic = "/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172/status";
    let message = {
      status: "disconnected"
    };
    messenger.messageResponder(topic, message);
  });

  it("should be able to process connection message", function () {
    let topic = "/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172/status";
    let message = {
      connected: true
    };
    messenger.messageResponder(topic, message);
  });

  it("should be able to process disconnection message", function () {
    let topic = "/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172/status";
    let message = {
      connected: false
    };
    messenger.messageResponder(topic, message);
  });

  // quick 261003-vbg: status topics act only on the topic owner's devices (or a transferred
  // device bound to the topic owner; that branch is pinned locally in MessengerOwnershipSpec).
  // Device#edit and #runDeviceTransformers are wrapped with recording pass-throughs set as own
  // properties and restored by deleting them, so the prototype methods are never replaced.
  function recordDeviceCalls(dev) {
    const calls = { edits: [], runs: [] };
    const edit = dev.edit;
    const run = dev.runDeviceTransformers;
    dev.edit = function (changes, callback) {
      calls.edits.push(changes && changes.udid);
      return edit.call(dev, changes, callback);
    };
    dev.runDeviceTransformers = function (profile, doc, ...rest) {
      calls.runs.push(doc && doc.udid);
      return run.call(dev, profile, doc, ...rest);
    };
    return calls;
  }

  function restoreDeviceCalls(dev) {
    delete dev.edit;
    delete dev.runDeviceTransformers;
  }

  it("261003-vbg: another owner's status topic never reaches Device#edit", async function () {
    const foreign = require("crypto").createHash("sha256").update("261003-vbg-ci-foreign-owner").digest("hex");
    const dev = messenger.device;
    const calls = recordDeviceCalls(dev);
    // quick 261003-w0c: MQTT device writes are gated off unless THINX_MQTT_DEVICE_WRITES=1.
    const savedDeviceWrites = process.env.THINX_MQTT_DEVICE_WRITES;
    process.env.THINX_MQTT_DEVICE_WRITES = "1";
    try {
      messenger.messageResponder("/" + foreign + "/" + TEST_DEVICE_6.udid + "/status", Buffer.from(JSON.stringify({ status: "vbg-foreign" })));
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect(calls.edits.indexOf(TEST_DEVICE_6.udid), "edit of the foreign-topic device").to.equal(-1);
      expect(calls.runs.indexOf(TEST_DEVICE_6.udid), "transformer run of the foreign-topic device").to.equal(-1);
    } finally {
      restoreDeviceCalls(dev);
      if (typeof (savedDeviceWrites) === "undefined") delete process.env.THINX_MQTT_DEVICE_WRITES;
      else process.env.THINX_MQTT_DEVICE_WRITES = savedDeviceWrites;
    }
  }, 20000);

  it("261003-vbg: the owner's own status topic reaches Device#edit (real CouchDB lookup)", async function () {
    const dev = messenger.device;
    const calls = recordDeviceCalls(dev);
    // quick 261003-w0c: MQTT device writes are gated off unless THINX_MQTT_DEVICE_WRITES=1.
    const savedDeviceWrites = process.env.THINX_MQTT_DEVICE_WRITES;
    process.env.THINX_MQTT_DEVICE_WRITES = "1";
    try {
      expect(TEST_DEVICE_6.udid).to.be.a('string');
      messenger.messageResponder("/" + test_owner + "/" + TEST_DEVICE_6.udid + "/status", Buffer.from(JSON.stringify({ status: "vbg-own" })));
      const deadline = Date.now() + 10000;
      while ((calls.edits.indexOf(TEST_DEVICE_6.udid) === -1) && (Date.now() < deadline)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // Only the edit call is asserted, never the stored document (transformer write-back race).
      expect(calls.edits.indexOf(TEST_DEVICE_6.udid), "edit of the owner's device").to.not.equal(-1);
    } finally {
      restoreDeviceCalls(dev);
      if (typeof (savedDeviceWrites) === "undefined") delete process.env.THINX_MQTT_DEVICE_WRITES;
      else process.env.THINX_MQTT_DEVICE_WRITES = savedDeviceWrites;
    }
  }, 20000);

  it("should be able to process actionable notification", function () {
    let topic = "/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172/status";
    let message = {
      notification: {
        response: false,
        nid: "nid-0000"
      }
    };
    messenger.messageResponder(topic, message);
  });

  it("should be able to process actionable notification from device", function () {
    let topic = "/07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c/d6ff2bb0-df34-11e7-b351-eb37822aa172/status";
    let message = {
      notification: {
        response: true,
        body: "Notification Response",
        response_type: "string"
      }
    };
    messenger.messageResponder(topic, message);
  });

  // message_callback(...)
  it("should survive message_callback call with bare message", function () {
    messenger.message_callback("/owner/device/test", "Bare no-NID message");
  });

  it("should survive message_callback call and return data", function (done) {
    messenger.data(test_owner, udid, (error, data) => {
      expect(error).to.equal(false);
      expect(data).to.be.a('string');
      done();
    });
  });

  // get_result_or_callback(...)
  // initWithOwner(...)
  // slack(...)
});
