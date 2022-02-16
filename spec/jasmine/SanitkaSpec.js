describe("Sanitka", function () {

  var expect = require('chai').expect;
  var Sanitka = require('../../lib/thinx/sanitka');
  var sanitka = new Sanitka();

  it("should sanitize URLs", function () {
    var s = sanitka.url("https://github.com/suculent/thinx-device-api/ && ");
    expect(s).to.equal("https://github.com/suculent/thinx-device-api/  ");
  });

  it("should sanitize branches (removing &)", function () {
    var s = sanitka.url("origin/master&");
    expect(s).to.equal("origin/master");
  });

  it("should de-escape (delete) dangerous shell characters \", \', ;", function () {
    var s = sanitka.deescape("\"\';;;\"");
    expect(s.length).to.be(null);
  });

  it("should accept valid owner", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.owner(input);
    expect(result).to.equal(input);
  });

  it("should reject valid owner", function () {
    var result = sanitka.owner("invalid-owner");
    expect(result).to.be(null);
  });

  it("should accept valid iOS push token", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.pushToken(input);
    expect(result).to.equal(input);
  });

  it("should accept valid GCM push token", function () {
    let input = "akO1-XdQYgk:APA91bHmgm_K500RVhexcxFVoczhp5RuMSKC07kOJB7T31xq2_a9tkUAFVGQNwtZ2JORj79lDRI0ow-nP17y82GD1zTWJTEnyjNMas_qNUKxBot1P-vM6v-BW7sqcISak8sXMK91WfmH";
    var result = sanitka.pushToken(input);
    expect(result).to.equal(input);
  });

  it("should reject invalid iOS push token", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823'";
    var result = sanitka.pushToken(input);
    expect(result).to.be(null);
  });

  it("should rejec invalid GCM push token", function () {
    let input = "akO1'XdQYgk!APA91bHmgm_K500RVhexcxFVoczhp5RuMSKC07kOJB7T31xq2_a9tkUAFVGQNwtZ2JORj79lDRI0ow-nP17y82GD1zTWJTEnyjNMas_qNUKxBot1P-vM6v-BW7sqcISak8sXMK91WfmH";
    var result = sanitka.pushToken(input);
    expect(result).to.be(null);
  });

  it("should accept valid API Key", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.apiKey(input);
    expect(result).to.equal(input);
  });

  it("should reject invalid API Key", function () {
    let input = "'31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.apiKey(input);
    expect(result).to.equal(null);
  });

  it("should accept valid username", function () {
    let input = "test";
    var result = sanitka.username(input);
    expect(result).to.equal(input);
  });
  it("should reject invalid username", function () {
    let input = "@test";
    var result = sanitka.username(input);
    expect(result).to.equal(null);
  });

});
