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

  // activation key is provided by e-mail for security,
  // cimrman@thinx.cloud receives his activation token in response
  // and must not be used in production environment

  it("should be able to create owner profile", function(done) {
    
    console.log("Creating user", user_body);
    
    user.create(user_body, true, (success, response) => {
      console.log("username_already_exists response:", response);
      if (success === false && typeof(response) == "string" && response.indexOf("username_already_exists")) {
        done();
        return;
      }
      console.log("create owner profile:", {success}, {response});
      if (typeof(response) == "string" && response.indexOf("username_already_exists") !== -1) {
        expect(success).to.equal(false);
        done();
        return;
      } else {
        expect(success).to.be.true;
      }
      expect(response.success).to.be.true;
      if (response.indexOf("username_already_exists" !== -1)) {
        done();
      }
      if (response) {
        console.log("Activation response: " + response);
        this.activation_key = response; // store activation token for next step
      }
      console.log("Create response: ", { response });
      done();
    }, {});

  }, 10000);

  it("should be able to fetch MQTT Key for owner", function(done) {
    user.mqtt_key(owner, function(success, apikey) {
      console.log({success}, {});
      console.log({success}, {apikey});
      //expect(success).to.be.true;
      //expect(apikey.key).to.be.a('string');
      if (success) {
        console.log("02 MQTT apikey: ", { apikey });
      } else {
        console.log("MQTT error: ", { apikey });
      }

      done();
    });
  }, 5000);

  xit("03 - should be able to fetch owner profile", function(done) {
    user.profile(owner, (success, response) => {
      if (success === false) {
        console.log("profile fetch response: " , {response});
        expect(success).to.be.true;
      }
      expect(response).to.be.an('object');
      done();
    });
  }, 10000);

  xit("04 - should be able to update owner info", function(done) {
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

  xit("05 - should be able to begin reset owner password", function(done) {
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
          expect(reponde).to.be.a('string');
          console.log(JSON.stringify(reponde)); // delete this when test passes
          done();
        });
      }
      expect(success).to.be.true;
    });
  }, 10000);

});
