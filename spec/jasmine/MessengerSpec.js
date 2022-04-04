var expect = require('chai').expect;

var Messenger = require('../../lib/thinx/messenger');
var messenger;

var Device = require("../../lib/thinx/device"); var device = new Device();

var envi = require("../_envi.json");
var test_owner = envi.oid;
var udid = envi.udid;

var User = require("../../lib/thinx/owner");
var user = new User();

describe("Messenger", function() {

  var ak = envi.ak;

  // This UDID is to be deleted at the end of test.
  var TEST_DEVICE_6 = {
    mac: "AA:BB:CC:EE:00:06",
    firmware: "MessengerSpec.js",
    version: "1.0.0",
    checksum: "alevim",
    push: "forget",
    alias: "virtual-test-device-6-messenger",
    owner: test_owner,
    platform: "platformio"
  };

  it("requires to register sample build device", function(done) {
    device.register(
      {}, /* req */
      TEST_DEVICE_6, /* reg.registration */
      ak,
      {}, /* ws */
      (success, response) => {
        TEST_DEVICE_6.udid = response.registration.udid;
        expect(success).to.equal(true);
        expect(TEST_DEVICE_6).to.be.a('object');
        expect(response.registration).to.be.a('object');
        expect(TEST_DEVICE_6.udid).to.be.a('string');
        done();
      });
  }, 20000); // register


  it("should be able to initialize", function (/* done */) {
    messenger = new Messenger("mosquitto").getInstance("mosquitto"); // requires injecting test creds, not custom creds!
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

  // getDevices: function(owner, callback)
  it("should be able to fetch devices for owner", function(done) {
    messenger.getDevices(test_owner, (success, devices) => {
      expect(devices).to.be.a('array');
      done();
    });
  });

  // publish: function(owner, udid, message); returns nothing
  it("should be able to publish upon connection", function(done) {
    messenger.publish(test_owner, udid, "test");
    done();
  }, 5000);

  it("should be able to send random quote", function (done) {
    messenger.sendRandomQuote(() => {
      done();
    });
  }, 5000);

  it("should be able to post random quote", function(done) {
    messenger.postRandomQuote(() => {
      done();
    });
    
  }, 5000);

  // may be disabled in case of last test left hanging
  it("[mm] should be able to setup MQTT client", function(done) {

    const Globals = require("../../lib/thinx/globals.js");
    var app_config = Globals.app_config();

    // TODO REMOVE; config is `{"server":"mqtt://mosquitto","port":1883}`
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
  it("should be able to respond to a message", function() {
    let topic = "/owner/device/test";
    let message = "Bare no-NID message";
    messenger.messageResponder(topic, message);
  });

  // TODO COVER WITH TESTS:
  // message_callback(...)
  // get_result_or_callback(...)
  // data(...)
  // initWithOwner(...)
  // slack(...)
});
