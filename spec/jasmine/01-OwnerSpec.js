describe("Owner", function() {

  var expect = require('chai').expect;
  
  var User = require("../../lib/thinx/owner");
  var user = new User();

  var envi = require("../_envi.json");
  
  var owner = envi.oid;
  var avatar_image = envi.test_avatar;
  var email = envi.email;
  var test_info = envi.test_info;
  const user_body = envi.test_info;
  var activation_k; // global

  // activation key is provided by e-mail for security,
  // cimrman@thinx.cloud receives his activation token in response
  // and must not be used in production environment

  it("(01) should be able to create owner profile", function(done) {
    
    user.create(user_body, true, (res, success, response) => {
      if (success === false && typeof(response) == "string" && response.indexOf("username_already_exists")) {
        done();
        return;
      }
      if (typeof(response) == "string" && response.indexOf("username_already_exists") !== -1) {
        expect(success).to.equal(false);
        done();
        return;
      } else {
        expect(success).to.be.true;
      }
      if (response.indexOf("username_already_exists" !== -1)) {
        done();
      }
      if (response) {
        console.log("(01) Activation response stored as this.activation_key: " + response);
        this.activation_key = response; // store activation token for next step
        activation_k = response;
      }
      console.log("(01) Create response: ", { response });
      expect(response).to.be.a('string');
      done();
    }, {});

  }, 10000);

  it("(02) should be able to fetch MQTT Key for owner", function(done) {
    user.mqtt_key(owner, function(success, apikey) {
      expect(success).to.be.true;
      expect(apikey.key).to.be.a('string');
      if (success) {
        console.log("02 MQTT apikey: ", { apikey });
      } else {
        console.log("02 MQTT error: ", { apikey });
      }
      done();
    });
  }, 5000);

  it("(03) should be able to fetch owner profile", function(done) {
    user.profile(owner, (success, response) => {
      if (success === false) {
        console.log("profile fetch FAILURE response: " , {response});
      }
      expect(success).to.be.true;
      expect(response).to.be.an('object');
      done();
    });
  }, 10000);

  it("(04) should be able to update owner info", function(done) {
    var body = {
      info: test_info
    };
    user.update(owner, body,
      function(success, response) {
        console.log(JSON.stringify(
          response));
        expect(success).to.be.true;
        done();
      });
  }, 10000);

  it("(05) should be able to begin reset owner password", function(done) {
    user.password_reset_init(email, (success, response) => {
      console.log("password-reset-init response:", JSON.stringify(response));
      if (response) {
        var body = {
          password: "tset",
          rpassword: "tset",
          owner: owner,
          reset_key: response
        };
        user.set_password(body, (sukec, reponde) => {
          if (sukec === false) {
            console.log("Password set result: ", {reponde});
          }
          expect(sukec).to.be.true;
          expect(reponde).to.be.an('object');
          expect(reponde.status).to.be.a('string');
          expect(reponde.status).to.equal('password_reset_successful');
          done();
        });
      }
      expect(success).to.be.true;
    });
  }, 10000);

});
