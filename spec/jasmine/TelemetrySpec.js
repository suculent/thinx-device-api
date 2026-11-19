/*
 * TelemetrySpec: validation of device-supplied RSSI, SNR and location
 * (HTTP registration body and MQTT status message). Pure, needs no services.
 */
const expect = require("chai").expect;
const Telemetry = require("../../lib/thinx/telemetry");

describe("Telemetry", function () {

  it("accepts integer dBm RSSI in range, from numbers and strict decimal strings", function () {
    expect(Telemetry.rssi(-67)).to.equal(-67);
    expect(Telemetry.rssi("-67")).to.equal(-67);
    expect(Telemetry.rssi(-67.4)).to.equal(-67);
    expect(Telemetry.rssi(0)).to.equal(0);
    expect(Telemetry.rssi(-150)).to.equal(-150);
  });

  it("rejects out-of-range or non-numeric RSSI", function () {
    for (const bad of [-151, 1, 99, " ", "", "-67dBm", "1e3", null, undefined, NaN, Infinity, {}, [], [-67], true, "0x10"]) {
      expect(Telemetry.rssi(bad), JSON.stringify(bad)).to.equal(null);
    }
  });

  it("bounds SNR and rounds it to 0.1 dB", function () {
    expect(Telemetry.snr(12.34)).to.equal(12.3);
    expect(Telemetry.snr("-3")).to.equal(-3);
    expect(Telemetry.snr(61)).to.equal(null);
    expect(Telemetry.snr(" ")).to.equal(null);
  });

  it("accepts a location in range and rounds it to 6 decimals", function () {
    expect(Telemetry.location(50.0880412345, 14.4207612345)).to.deep.equal({ lat: 50.088041, lon: 14.420761 });
    expect(Telemetry.location("-33.865", "151.209")).to.deep.equal({ lat: -33.865, lon: 151.209 });
    expect(Telemetry.location(-90, -180)).to.deep.equal({ lat: -90, lon: -180 });
  });

  it("rejects 0,0, out-of-range, partial or non-numeric locations", function () {
    expect(Telemetry.location(0, 0)).to.equal(null);
    expect(Telemetry.location(90.1, 10)).to.equal(null);
    expect(Telemetry.location(10, 180.5)).to.equal(null);
    expect(Telemetry.location(50, undefined)).to.equal(null);
    expect(Telemetry.location("50; DROP", 14)).to.equal(null);
    expect(Telemetry.location({ $gt: 0 }, 14)).to.equal(null);
  });

  it("reads rssi_dbm and a gnss fix from an MQTT status message", function () {
    expect(Telemetry.fromStatusMessage({ status: "checked_in", rssi_dbm: -71, gnss: { fix: true, lat: 50.088, lon: 14.421 } }))
      .to.deep.equal({ rssi: -71, lat: 50.088, lon: 14.421 });
  });

  it("falls back to last_fix when gnss has no fix, and to rssi when rssi_dbm is absent", function () {
    expect(Telemetry.fromStatusMessage({ rssi: -80, gnss: { fix: false, reason: "no_fix" }, last_fix: { lat: 49.1, lon: 16.6, age_s: 3600 } }))
      .to.deep.equal({ rssi: -80, lat: 49.1, lon: 16.6 });
  });

  it("ignores a gnss block without fix:true and writes nothing for junk", function () {
    expect(Telemetry.fromStatusMessage({ gnss: { fix: "yes", lat: 50, lon: 14 } })).to.deep.equal({});
    expect(Telemetry.fromStatusMessage({ rssi_dbm: "strong", gnss: [1, 2], last_fix: "x", lat: 0, lon: 0 })).to.deep.equal({});
    expect(Telemetry.fromStatusMessage(null)).to.deep.equal({});
    expect(Telemetry.fromStatusMessage([])).to.deep.equal({});
  });

  it("never copies other message keys (no mass assignment)", function () {
    const out = Telemetry.fromStatusMessage(JSON.parse('{"rssi_dbm":-60,"owner":"x","udid":"y","__proto__":{"polluted":1},"lastkey":"k"}'));
    expect(Object.keys(out)).to.deep.equal(["rssi"]);
    expect(({}).polluted).to.equal(undefined);
  });

  it("validates registration bodies the same way", function () {
    expect(Telemetry.fromRegistration({ rssi: -55, snr: 9, lat: 50.1, lon: 14.4 })).to.deep.equal({ rssi: -55, snr: 9, lat: 50.1, lon: 14.4 });
    expect(Telemetry.fromRegistration({ rssi: " ", snr: " ", lat: 0, lon: 0 })).to.deep.equal({});
  });
});
