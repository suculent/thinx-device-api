/*
 * Messenger drop-line limiter (quick 261004-25u follow-up).
 *
 * With THINX_MQTT_DEVICE_WRITES=1, `registration_recent_checkin` fires on almost every device
 * boot and `status_stale_disconnect` on every reconnect. Those expected skips must not use up
 * the 5-lines-per-60-s window that the security drop lines (foreign_owner, malformed_topic, …)
 * share, or a burst of boots would hide them as a suppressed count.
 *
 * Exercises Messenger#logDroppedDeviceMessage on a bare instance (no broker, Redis or CouchDB).
 */

const expect = require("chai").expect;
const Messenger = require("../../lib/thinx/messenger");

describe("Messenger drop-line limiter", function () {

  let lines;
  let spy;

  function bare() {
    return Object.create(Messenger.prototype);
  }

  beforeEach(function () {
    lines = [];
    spy = spyOn(console, "log").and.callFake((l) => lines.push(String(l)));
  });

  afterEach(function () {
    spy.and.callThrough();
  });

  it("L1 expected skips do not suppress security drop lines in the same window", function () {
    const m = bare();
    for (let i = 0; i < 20; i++) m.logDroppedDeviceMessage("registration_recent_checkin", "u" + i);
    for (let i = 0; i < 5; i++) m.logDroppedDeviceMessage("status_stale_disconnect", "s" + i);
    m.logDroppedDeviceMessage("foreign_owner", "f1");
    m.logDroppedDeviceMessage("malformed_topic", null);
    const security = lines.filter((l) => /dropped MQTT device message: (foreign_owner|malformed_topic)/.test(l));
    expect(security.length).to.equal(2);
  });

  it("L2 expected skips are still rate-limited (at most 5 lines per window)", function () {
    const m = bare();
    for (let i = 0; i < 20; i++) m.logDroppedDeviceMessage("registration_recent_checkin", "u" + i);
    const skips = lines.filter((l) => l.indexOf("registration_recent_checkin") !== -1);
    expect(skips.length).to.equal(5);
  });

  it("L3 security drop lines keep their own 5-line cap", function () {
    const m = bare();
    for (let i = 0; i < 9; i++) m.logDroppedDeviceMessage("foreign_owner", "f" + i);
    expect(lines.filter((l) => l.indexOf("foreign_owner") !== -1).length).to.equal(5);
  });

  it("L4 the per-message marker still allows one line per message across both kinds", function () {
    const m = bare();
    const drop = { logged: false };
    m.logDroppedDeviceMessage("registration_recent_checkin", "u1", drop);
    m.logDroppedDeviceMessage("foreign_owner", "u1", drop);
    expect(lines.length).to.equal(1);
  });
});
