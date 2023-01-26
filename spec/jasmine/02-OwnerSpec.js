let expect = require('chai').expect;
let Owner = require("../../lib/thinx/owner");
let envi = require("../_envi.json");
let owner = envi.oid;
let email = envi.email;
let test_info = envi.test_info;
const user_body = envi.test_info;

let Globals = require('../../lib/thinx/globals');
const redis_client = require('redis');

describe("Owner", function () {

  let user;
  let redis;

  beforeAll(async () => {
    console.log(`🚸 [chai] >>> running Owner spec`);
    redis = redis_client.createClient(Globals.redis_options());
    await redis.connect();
    user = new Owner(redis);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Owner spec`);
  });

  // activation key is provided by e-mail for security,
  // cimrman@thinx.cloud receives his activation token in response
  // and must not be used in production environment

  it("(01) should be able to create owner profile", function (done) {

    let res_mock = {};

    console.log("(01) Creating user", user_body);

    user.create(user_body, true, res_mock, (_res, success, response) => {

      console.log("[DEBUG] user.create response", { _res}, {success}, {response});
      
      // valid case is existing user as well
      if (typeof (response) == "string" && response.indexOf("username_already_exists") !== -1) {
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

  it("(02) should be able to fetch MQTT Key for owner", function (done) {
    // deepcode ignore NoHardcodedPasswords: <please specify a reason of ignoring this>
    user.mqtt_key(owner, (success, apikey) => {
      expect(apikey.key).to.be.a('string');
      expect(success).to.equal(true);
      done();
    });
  }, 5000);

  it("(03) should be able to fetch owner profile", function (done) {
    user.profile(owner, (success, response) => {
      expect(response).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(04) should be able to update owner info", function (done) {
    const body = {
      info: test_info
    };
    user.update(owner, body, (success, response) => {
      expect(response).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(05) should be able to begin reset owner password", function (done) {
    user.password_reset_init(email, (success, result) => {
      console.log("[spec] user.password_reset_init success:", success, "reset_key", result);
      expect(success).to.equal(true);
      expect(result).to.be.a('string');
      let body = {
        password: "tset",
        rpassword: "tset",
        owner: owner,
        reset_key: result
      };
      user.set_password(body, (sukec, reponde) => {
        console.log("[spec] user.set_password reponde:", sukec, reponde);
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

  it("(09) should support stringToBoolean", function () {
    let t = user.stringToBoolean('true');
    expect(t).to.equal(true);
    let f = user.stringToBoolean('false');
    expect(f).to.be.false;
  });

  it("(10) should support sendMail", function (done) {

    let theEmail = {
      from: 'THiNX API <api@thinx.cloud>',
      to: "cimrman@thinx.cloud",
      subject: "Your data will be deleted",
      text: "Hello Jara Cimrman" +
        ". This is a notification warning, that your data will be deleted in 24 hours due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.",
      html: "<p>Hello," +
        "</p><p>This is a notification warning, that your data will be deleted in 24 hours due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.</p><p>" +
        "</p><p>This e-mail was sent automatically. Please do not reply.</p>Sincerely your THiNX</p>"
    };

    user.sendMail(theEmail, "mail_24", (result) => {
      expect(result).to.be.false;
      done();
    });
  });

  it("(11) should update avatar", function (done) {
    user.saveAvatar(envi.oid, "<avatar-mock>", (result) => {
      expect(result).to.be.true;
      done();
    });
  });


});
