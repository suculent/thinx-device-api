describe("Owner", function() {

  var expect = require('chai').expect;
  
  var User = require("../../lib/thinx/owner");
  var user = new User();

  var envi = require("../_envi.json");
  
  var owner = envi.oid;
  var email = envi.email;
  var test_info = envi.test_info;
  const user_body = envi.test_info;

  // activation key is provided by e-mail for security,
  // cimrman@thinx.cloud receives his activation token in response
  // and must not be used in production environment

  it("(01) should be able to create owner profile", function(done) {

    let res_mock = {};
    
    user.create(user_body, true, res_mock, (res, success, response) => {
      // valid case is existing user as well
      if (typeof(response) == "string" && response.indexOf("username_already_exists") !== -1) {
        expect(success).to.equal(false);
        done();
        return;
      }

      // initial valid case
      expect(response).to.be.a('string');
      expect(success).to.equal(true);
      this.activation_key = response; // store activation token for next step
      done();
    }, {});

  }, 10000);

  it("(02) should be able to fetch MQTT Key for owner", function(done) {
    // deepcode ignore NoHardcodedPasswords: <please specify a reason of ignoring this>
    user.mqtt_key(owner, (success, apikey) => {
      expect(apikey.key).to.be.a('string');
      expect(success).to.equal(true);
      done();
    });
  }, 5000);

  it("(03) should be able to fetch owner profile", function(done) {
    user.profile(owner, (success, response) => {
      console.log("[spec] (03) user profile:", JSON.stringify(response, null, 4));
      expect(response).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(04) should be able to update owner info", function(done) {
    var body = {
      info: test_info
    };
    user.update(owner, body, (success, response) => {
        expect(response).to.be.an('object');
        expect(success).to.equal(true);
        done();
      });
  }, 10000);

  it("(05) should be able to begin reset owner password", function(done) {
    user.password_reset_init(email, (success, response) => {
      if ((typeof(response) == "string") && (response.indexOf("user_not_found") !== -1)) {
        expect(success).to.equal(false);
        done();
        return;
      } else {
        expect(response).to.be.an('object');
        expect(success).to.equal(true);
      }
      var body = {
        password: "tset",
        rpassword: "tset",
        owner: owner,
        reset_key: response
      };
      user.set_password(body, (sukec, reponde) => {
        expect(reponde).to.be.an('object');
        expect(reponde.status).to.be.a('string');
        expect(reponde.status).to.equal('password_reset_successful');
        expect(sukec).to.equal(true);
        done();
      });
    });
  }, 10000);

  it("(06) should be able to create mesh", function (done) {
    user.createMesh(owner, "mock-mesh-id", "mock-mesh-alias", (success, result) => {
      expect(result).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(07) should be able to list meshes", function (done) {
    user.listMeshes(owner, (success, result) => {
      expect(result).to.be.an('array');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(08) should be able to delete meshes", function (done) {
    user.deleteMeshes(owner, ["mock-mesh-id"], (success, result) => {
      expect(result).to.be.an('array');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

});
