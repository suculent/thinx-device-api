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

  it("01 - should be able to create/update owner profile", function(done) {
    
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
      var body = {
        info: {
          avatar: avatar_image
        }
      };
      user.update(
        owner,
        body,
        function(xuccess, xesponse) {
        if (xuccess === false) {
          console.log("avatar update response: " , {xesponse});
        }
        expect(xuccess).to.be.true;
        
        function testActivation(anOwner, key, done) {
          user.activate(anOwner, key, function (_success, _response) {
            expect(_success).to.be.true;
            expect(_response).to.be.a('string');
            console.log({_response});
            done();
          });
        }
    
        console.log("Testing Activation...");
        testActivation(owner, this.activation_key, done);

      });
    });

  }, 10000);

  it("02 - should be able to fetch MQTT Key for owner", function(done) {
    user.mqtt_key(owner, (success, apikey) => {
      /*
      { success: true } {
        apikey: {
          name: '******************************688bbed67710d991914066238f7ea415d7',
          key: 'bdd072f5fcfc810255114a92d4c1a2688bbed67710d991914066238f7ea415d7',
          hash: '202617b90348fc03f5215915e0f08d9ca8dbd0a2d6940e2bbba2276c981f658a',
          alias: 'Default MQTT API Key'
        }
      }
      */
      expect(success).to.be.true;
      expect(apikey.key).to.be.a('string');
      if (success) {
        console.log("MQTT apikey: ", { apikey });
      } else {
        console.log("MQTT error: ", { apikey });
      }

      done();
    });
  }, 5000);

  it("03 - should be able to fetch owner profile", function(done) {
    user.profile(owner, (success, response) => {
      if (success === false) {
        console.log("profile fetch response: " , {response});
        expect(success).to.be.true;
      }
      expect(response).to.be.an('object');
      done();
    });
  }, 10000);

  it("04 - should be able to update owner info", function(done) {
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

  it("05 - should be able to begin reset owner password", function(done) {
    user.password_reset_init(email, (success, response) => {
      if (success === false) {
        console.log(response);
      }
      console.log(JSON.stringify(response));
      expect(success).to.be.true;
      expect(response).to.be.a('string');
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
    });
  }, 10000);

});
