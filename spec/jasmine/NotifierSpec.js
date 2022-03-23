var Notifier = require('../../lib/thinx/notifier');

describe("Notifier", function () {

  var envi = require("../_envi.json");

  it("should be able to send a notification", function (done) {

    /* this is how job_status is generated inside the global build script:
    # Inside Worker, we don't call notifier, but just post the results into shell... THiNX builder must then call the notifier itself (or integrate it later)
    JSON=$(jo \
    build_id=${BUILD_ID} \
    commit=${COMMIT} \
    thx_version=${THX_VERSION} \
    git_repo=${GIT_REPO} \
    outfile=$(basename ${OUTFILE}) \
    udid=${UDID} \
    sha=${SHA} \
    owner=${OWNER_ID} \
    status=${STATUS} \
    platform=${PLATFORM} \
    version=${THINX_FIRMWARE_VERSION} \
    md5=${MD5} \
    env_hash=${ENV_HASH} \
    )
    */

    // Hey, this should be JUST a notification, no destructives.
    var test_build_id = "mock_build_id";
    var test_commit_id = "mock_commit_id";
    var test_repo = "https://github.com/suculent/thinx-firmware-esp8266-pio.git";
    var test_binary = "/tmp/nothing.bin";
    var test_udid = envi.udid; // "745af760-a617-11ec-aa0e-231b40618f37"; // not attached to this firmware
    var sha = "one-sha-256-pls";
    var owner_id = envi.oid;
    var status = "TESTING_NOTIFIER";
    var platform = "platformio";
    var version = "thinx-firmware-version-1.0";

    let job_status = {
      build_id: test_build_id,
      commit: test_commit_id,
      thx_version: "1.5.X",
      git_repo: test_repo,
      outfile: test_binary,
      udid: test_udid,
      sha: sha,
      owner: owner_id,
      status: status,
      platform: platform,
      version: version,
      md5: "md5-mock-hash",
      env_hash: "cafebabe"
    };

    let notifier = new Notifier();

    notifier.process(job_status, (result) => {
      console.log("ℹ️ [info] Notifier's Processing result:", result);
      done();
    });
  });

});
