describe("Owner", function() {

  var expect = require('chai').expect;
  
  var User = require("../lib/thinx/owner");
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
    
    user.create(user_body, true, function(success, response) {
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
        activation_key = response;
      }
      console.log("Create response: ", { response });
      done();
    });

  }, 10000);

  it("should be able to fetch MQTT Key for owner", function(done) {
    user.mqtt_key(owner, function(success, apikey) {
      console.log({success}, {});
      console.log({success}, {apikey});
      //expect(success).to.be.true;
      //expect(apikey.key).to.be.a('string');
      if (success) {
        console.log("MQTT apikey: ", { apikey });
      } else {
        console.log("MQTT error: ", { apikey });
      }

      done();
    });
  }, 5000);

  it("should be able to update owner avatar",
    function(done) {
      var body = {
        info: {
          avatar: avatar_image
        }
      };
      user.update(
        owner,
        body,
        function(success, response) {
        if (success === false) {
          console.log("avatar update response: " , {response});
        }
        expect(success).to.be.true;
        done();
      });
    }, 10000);

  it("should be able to fetch owner profile", function(done) {
    user.profile(owner, function(success, response) {
      expect(response).to.be.a('string');
      expect(success).to.be.true;
      if (success === false) {
        console.log("profile fetch response: " , {response});
      }
      done();
    });
  }, 10000);

  it("should be able to update owner info", function(done) {
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

  // This expects activated account and e-mail fetch support
  it("should be able to activate owner", function (done) {

    function testActivation(owner, key, done) {
      user.activate(owner, key, function (success, response) {
        expect(success).to.be.true;
        expect(response).to.be.a('string');
        console.log(JSON.stringify(response));
        done();
      });
    }
    // activation_key requires User to be created first using user.create and take the key as (global?)
    if (typeof (this.activation_key) === "undefined") {
      
      user.create(user_body, true, function (success, response) {

        if (success == false && typeof (response) == "string" && response.indexOf("username_already_exists")) {
          // OK)
        }
        console.log("(2) create owner profile:", { success }, { response });
        if (typeof (response) == "string" && response.indexOf("username_already_exists") !== -1) {
          console.log({ response });
        } else {
          expect(success).to.be.true;
        }
        expect(response.success).to.be.true;
        if (response.indexOf("username_already_exists" !== -1)) {
          console.log({ response });
        }
        if (response) {
          console.log("Activation response: " + response);
          this.activation_key = response; // store activation token for next step
          testActivation(owner, response, done);
        }

      });
    } else {
      testActivation(owner, this.activation_key, done);
    }

  }, 10000);

  it("should be able to begin reset owner password", function(done) {
    user.password_reset_init(email, (success, response) => {
      if (success === false) {
        console.log(response);
      }
      expect(success).to.be.true;
      expect(response).to.be.a('string');
      console.log(JSON.stringify(response));
      if (response) {
        expect(response).to.be.a('string');
        var body = {
          password: "tset",
          rpassword: "tset",
          owner: owner,
          reset_key: response
        };
        user.set_password(body, function(sukec, reponde) {
          if (sukec === false) {
            console.log("Password set result: ", {reponde});
          }
          expect(sukec).to.be.true;
          expect(reponde).to.be.a('string');
          console.log(JSON.stringify(reponde)); // delete this when test passes
          done();
        });
      }
    });
  }, 10000);

});
