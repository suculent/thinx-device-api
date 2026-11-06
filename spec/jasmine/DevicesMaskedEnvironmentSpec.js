const expect = require('chai').expect;
const Devices = require("../../lib/thinx/devices");

describe("Devices#maskedEnvironment", function () {

  const mask = (environment) => Devices.prototype.maskedEnvironment.call({}, { environment: environment });

  it("masks the legacy ssid/pass keys, keeping two characters", function () {
    expect(mask({ ssid: "ExampleNet", pass: "hunter22" })).to.deep.equal({ ssid: "Ex*****", pass: "hu*****" });
  });

  it("masks THINX_ENV_SSID and THINX_ENV_PASS", function () {
    const out = mask({ console: "true", THINX_ENV_SSID: "ExampleNet", THINX_ENV_PASS: "hunter22" });
    expect(out).to.deep.equal({ console: "true", THINX_ENV_SSID: "Ex*****", THINX_ENV_PASS: "hu*****" });
  });

  it("masks other *_SSID / *_PASSWORD keys in any case", function () {
    const out = mask({ wifi_ssid: "Home", MQTT_PASSWORD: "secret-value", Backup_Pass: "abcdef" });
    expect(out).to.deep.equal({ wifi_ssid: "*****", MQTT_PASSWORD: "se*****", Backup_Pass: "ab*****" });
  });

  it("leaves keys that only contain the words untouched", function () {
    const out = mask({ PASSTHROUGH: "on", SSID_LIST: "a,b", compass: "north", bypass_mode: "x" });
    expect(out).to.deep.equal({ PASSTHROUGH: "on", SSID_LIST: "a,b", compass: "north", bypass_mode: "x" });
  });

  it("masks short and non-string values completely", function () {
    expect(mask({ pass: "1234", ssid: 42, THINX_ENV_PASS: "" })).to.deep.equal({ pass: "*****", ssid: "*****", THINX_ENV_PASS: "*****" });
  });

  it("does not modify the stored device environment", function () {
    const dvc = { environment: { THINX_ENV_SSID: "ExampleNet", pass: "hunter22" } };
    const out = Devices.prototype.maskedEnvironment.call({}, dvc);
    expect(out).to.not.equal(dvc.environment);
    expect(dvc.environment).to.deep.equal({ THINX_ENV_SSID: "ExampleNet", pass: "hunter22" });
  });

  it("returns an empty object for a missing or malformed environment", function () {
    expect(mask(undefined)).to.deep.equal({});
    expect(mask(null)).to.deep.equal({});
    expect(mask("ssid=x")).to.deep.equal({});
    expect(mask(["ssid"])).to.deep.equal({});
    expect(Devices.prototype.maskedEnvironment.call({}, null)).to.deep.equal({});
  });
});
