describe("Notifier", function() {

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var exec = require("child_process");

  // Well, this will be some fun. The notifier.js is being called on following circumstances:
  // node.js process exeutes the builder.sh (should do that in background, but initial test versions did this synchronously
  // builder.sh calls the node.js with statically allocated parameters. and the damned feat hijak is cool and like edrush and better than those rappers.

  // Test disabled, because this is being covered as a part of builds anyway
  it("should be able to send a notification", function(done) {
    // Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope
    // (or stores into DB later)

    // CMD="${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${OUTFILE} ${UDID} ${SHA} ${OWNER_ID} ${STATUS} ${PLATFORM} ${THINX_FIRMWARE_VERSION}"

    // 22fd7ed0-e193-11e7-b6e6-1bece759073e 3ee7bb498a6cd6d28a1b91f605f533384490f45b 131 git@github.com:suculent/thinx-firmware-esp8266-pio.git <none> d6ff2bb0-df34-11e7-b351-eb37822aa172 0x00000000 4f1122fa074af4dabab76a5205474882c82de33f50ecd962d25d3628cd0603be OK platformio

    // Hey, this should be JUST a notification, no destructives.
    var test_build_id = "no_build_id";
    var test_commit_id = "crime_commit_id";
    var test_version = "v0.0";
    var test_repo =
      "https://github.com/suculent/thinx-firmware-esp8266-pio.git";
    var test_binary = "nothing.bin";
    var test_udid = "d6ff2bb0-df34-11e7-b351-eb37822aa172";
    var sha = "one-sha-256-pls";
    var owner_id = owner;
    var status = "TESTING_NOTIFIER";
    var platform = "platformio";
    var version = "thinx-firmware-version-1.0";

    var CMD = "node " + __dirname + "/../../notifier.js " +
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

    // CMD: "${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${DEPLOYMENT_PATH}/${BUILD_ID}.bin ${UDID} ${SHA} ${OWNER_ID} ${STATUS}";
    console.log("Notifier command: " + CMD);
    var error = exec.execSync(CMD);
    console.log("Notifier result: ");
    console.log({error});
    //expect(error).not.toBeDefined();
    done();
  });

}, 10000);
