describe("Owner", function() {

  var expect = require('chai').expect;
  
  var generated_key_hash = null;
  var user = require('../../lib/thinx/owner');
  var User = new user();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var avatar_image = envi.test_avatar;
  var email = envi.email;
  var test_info = envi.test_info;

  var activation_key;
  var reset_key;

  // activation key is provided by e-mail for security,
  // cimrman@thinx.cloud receives his activation token in response
  // and must not be used in production environment

  it("should be able to create owner profile", function(done) {
    var body = {
      first_name: "Jára",
      last_name: "Cimrman",
      email: email,
      owner: "cimrman"
    };
    User.create(body, true, function(success, response) {
      console.log("username_already_exists response:", response);
      if (success == false && typeof(response) == "string" && response.indexOf("username_already_exists")) {
        done();
        return;
      }
      console.log("create owner profile:", {success}, {response});
      if (typeof(response) == "string" && response.indexOf("username_already_exists") !== -1) {
        expect(success).to.equal(false);
        done();
        return;
      } else {
        expect(success).to.equal(true);
      }
      expect(response.success).to.equal(true);
      if (response.indexOf("username_already_exists" !== -1)) {
        done();
      }
      if (response) {
        console.log("Activation response: " + response);
        this.activation_key = response; // store activation token for next step
      }
      console.log("Create response: ", { response });
      done();
    });

  }, 10000);

  it("should be able to fetch MQTT Key for owner", function(done) {
    User.mqtt_key(owner, function(success, apikey) {
      console.log({success}, {});
      console.log({success}, {apikey});
      //expect(success).to.equal(true);
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
      User.update(
        owner,
        body,
        function(success, response) {
        if (success === false) {
          console.log("avatar update response: " , {response});
        }
        expect(success).to.equal(true);
        done();
      });
    }, 10000);

  it("should be able to fetch owner profile", function(done) {
    User.profile(owner, function(success, response) {
      expect(response).to.be.a('string');
      expect(success).to.equal(true);
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
    User.update(owner, body,
      function(success, response) {
        console.log(JSON.stringify(
          response));
        expect(success).to.equal(true);
        done();
      });
  }, 10000);

  // This expects activated account and e-mail fetch support
  it("should be able to activate owner", function(done) {
    // activation_key requires User to be created first using User.create and take the key as (global?)
    if (typeof(this.activation_key) === "undefined") {
      // not available? mock it asap.
      var body = {
        first_name: "Jára",
        last_name: "Cimrman",
        email: email,
        owner: "cimrman"
      };
      User.create(body, true, function(success, response) {
        
        if (success == false && typeof(response) == "string" && response.indexOf("username_already_exists")) {
          // OK
        }
        console.log("(2) create owner profile:", {success}, {response});
        if (typeof(response) == "string" && response.indexOf("username_already_exists") !== -1) {
          console.log({response});
        } else {
          expect(success).to.equal(true);
        }
        expect(response.success).to.equal(true);
        if (response.indexOf("username_already_exists" !== -1)) {
          console.log({response});
        }
        if (response) {
          console.log("Activation response: " + response);
          this.activation_key = response; // store activation token for next step

          User.activate(owner, this.activation_key, function(success, response) {
            expect(success).to.equal(true);
            expect(response).to.be.a('string');
            console.log(JSON.stringify(response));
            done();
          });

        }
        
      });
    } else {
      User.activate(owner, this.activation_key, function(success, response) {
        expect(success).to.equal(true);
        expect(response).to.be.a('string');
        console.log(JSON.stringify(response));
        done();
      });
    }
    
  }, 10000);

  it("should be able to begin reset owner password", function(done) {
    User.password_reset_init(email, function(success, response) {
      if (success === false) {
        console.log(response);
      }
      expect(success).to.equal(true);
      expect(response).to.be.a('string');
      console.log(JSON.stringify(response));
      if (response) {
        this.reset_key = response; // store reset token for next step
        expect(this.reset_key).to.be.a('string');
      }
      done();
    });
  }, 10000);

  // async version fails
  it("should be able to set owner password", function() {
    var body = {
      password: "tset",
      rpassword: "tset",
      owner: owner,
      reset_key: this.reset_key
    };
    User.set_password(body, function(success, response) {
      expect(this.reset_key).to.be.a('string');
      if (success === false) {
        console.log("Password set result: " + response);
      }
      expect(success).to.equal(true);
      expect(response).to.be.a('string');
      console.log(JSON.stringify(response));
    });

  });

});
