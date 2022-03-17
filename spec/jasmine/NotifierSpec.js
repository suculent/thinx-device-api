var Notifier require('../../lib/thinx/notifier');
var exec = require("child_process");

describe("Notifier", function() {

  var envi = require("../_envi.json");
  
  it("should be able to send a notification", function() {
    // Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope
    // (or stores into DB later)

    // Hey, this should be JUST a notification, no destructives.
    var test_build_id = "no_build_id";
    var test_commit_id = "crime_commit_id";
    var test_version = "v0.0";
    var test_repo =
      "https://github.com/suculent/thinx-firmware-esp8266-pio.git";
    var test_binary = "nothing.bin";
    var test_udid = "d6ff2bb0-df34-11e7-b351-eb37822aa172";
    var sha = "one-sha-256-pls";
    var owner_id = envi.oid;
    var status = "TESTING_NOTIFIER";
    var platform = "platformio";
    var version = "thinx-firmware-version-1.0";

    var CMD = "node " + __dirname + "/../../lib/thinx/notifier.js " +
      test_build_id + " " +
      test_commit_id + " " +
      test_version + " " +
      test_repo + " " +
      test_binary + " " +
      test_udid + " " +
      sha + " " +
      owner_id + " " +
      status + " " +
      platform + " " +
      version;
    
    let notifier = new Notifier();

    // TODO: Get sample job_status from somewhere to mock it

    let job_status = {};

    notifier.process(job_status, (result) => {
      console.log("ℹ️ [info] Notifier's Processing result:", result);
      done();
    });
  });

});
