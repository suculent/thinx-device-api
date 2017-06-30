describe("Owner", function() {

  var generated_key_hash = null;
  var User = require('../../lib/thinx/owner');

  var envi = require("_envi.json");
  var owner = envi.owner;
  var avatar_image = envi.test_avatar;
  var email = envi.email;
  var test_info = envi.test_info;

  var activation_key = null;
  var reset_key = null;

  // activation key is provided by e-mail for security,
  // cimrman@thinx.cloud receives his activation token in response
  // and must not be used in production environment

  it("should be able to create owner profile", function(done) {
    var body = {
      first_name: "Jára",
      last_name: "Cimrman",
      email: email,
      owner: "0x0z1mmerman"
    };
    User.create(body, function(success, response) {
      if (response.toString().indexOf("email_already_exists") !== -
        1) {
        expect(success).toBe(false);
      } else {
        expect(success).toBe(true);
      }
      expect(response).toBeDefined();
      if (response) {
        activation_key = response; // store activation token for next step
      }
      console.log(JSON.stringify(response));
      done();
    });

  }, 10000);

  it("should be able to update owner avatar",
    function(done) {
      var body = {
        avatar: avatar_image
      };
      User.update(owner, body, function(success,
        response) {
        console.log(JSON.stringify(response));
        expect(success).toBe(true);
        done();
      });
    }, 10000);

  it("should be able to fetch owner profile", function(done) {
    User.profile(owner, function(success, response) {
      expect(response).toBeDefined();
      expect(success).toBe(true);
      console.log(JSON.stringify(response));
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
        expect(success).toBe(true);
        done();
      });
  }, 10000);

  // This expects activated account and e-mail fetch support
  it("should be able to activate owner", function(done) {
    User.activate(owner, activation_key, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log(JSON.stringify(response));
      done();
    });
  }, 10000);

  it("should be able to begin reset owner password", function(done) {
    User.password_reset_init(email, function(
      success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log(JSON.stringify(response));
      if (response) {
        reset_key = response; // store reset token for next step
      }
      done();
    });
  }, 10000);

  it("should be able to set owner password", function(done) {
    var body = {
      password: "tset",
      rpassword: "tset",
      owner: owner,
      reset_key: reset_key
    };
    User.set_password(owner, body, function(success,
      response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log(JSON.stringify(response));
      done();
    });
  }, 10000);
});
