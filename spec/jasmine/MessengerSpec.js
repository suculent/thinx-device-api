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
        if (success === false) {
          console.log("(01) registration response", response);
          expect(response).to.be.a('string');
          if (response === "owner_found_but_no_key") {
            done();
            return;
          }
        }
        TEST_DEVICE_6.udid = response.registration.udid;
        expect(success).to.equal(true);
        expect(TEST_DEVICE_6).to.be.an('object');
        expect(response.registration).to.be.an('object');
        expect(TEST_DEVICE_6.udid).to.be.a('string');
        done();
      });
  }, 15000); // register


  it("should be able to initialize", function (/* done */) {
    messenger = new Messenger("mosquitto").getInstance("mosquitto"); // requires injecting test creds, not custom creds!
  });

  // this requires having owner and devices registered in the DB, 
  it("should be able to initialize with owner", function () {

    const mock_socket = {}; // let socket = app._ws[owner]; - websocket should be extracted to be instantiated on its own
    console.log("✅ [spec]  Initializing messenger with owner", test_owner, "socket", mock_socket);
    messenger.initWithOwner(test_owner, mock_socket, (success, status) => {
      console.log("✅ [spec] messenger initialized: ", { success: success, status: status });
      expect(success).to.be(true);
      //done();
    });
  });

  // getDevices: function(owner, callback)
  it("should be able to fetch devices for owner", function(done) {
    messenger.getDevices(test_owner, (success, devices) => {
      expect(devices).to.be.an('array');
      done();
    });
  });

  // publish: function(owner, udid, message); returns nothing
  it("should be able to publish upon connection", function(done) {
    messenger.publish(test_owner, udid, "test");
    done();
  }, 5000);

  it("should be able to send random quote", function(done) {
    messenger.sendRandomQuote();
    done();
  }, 5000);

  it("[mm] should be able to setup MQTT client", function(done) {

    const Globals = require("../../lib/thinx/globals.js");
    var app_config = Globals.app_config();

    console.log(`[spec] [mm] [debug] getting apikey with config ${JSON.stringify(app_config.mqtt)}`); // TODO REMOVE

    user.mqtt_key(test_owner, "mosquitto", (key_success, apikey) => {

      console.log(`[spec] [mm] fetched mqtt key? ${key_success} with apikey ${apikey}`);

      expect(key_success).to.equal(true);
      expect(apikey).to.be.a('string');

      let mqtt_options = {
        host: app_config.mqtt.server,
        port: app_config.mqtt.port,
        username: test_owner,
        password: apikey
      };

      console.log(`[spec] [mm] setting up client for owner ${test_owner} with options ${mqtt_options}`);
  
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
