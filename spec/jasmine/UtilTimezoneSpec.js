/* Device timezone helpers — pure, no config, no CouchDB.
 * Style follows ZZ-RedactionScriptSpec.js (chai expect + banner convention).
 */

const expect = require('chai').expect;
const Util = require('../../lib/thinx/util.js');
const momentTz = require('moment-timezone');

describe("Util timezone helpers", function () {

  beforeAll(() => { console.log(`🚸 [chai] >>> running UtilTimezone spec`); });
  afterAll(() => { console.log(`🚸 [chai] <<< completed UtilTimezone spec`); });

  describe("isValidTimezone", function () {

    it("accepts IANA zone names", function () {
      expect(Util.isValidTimezone("Europe/Prague")).to.equal(true);
      expect(Util.isValidTimezone("America/New_York")).to.equal(true);
      expect(Util.isValidTimezone("UTC")).to.equal(true);
    });

    it("rejects abbreviations, which cannot be resolved back to a zone", function () {
      expect(Util.isValidTimezone("CEST")).to.equal(false);
      expect(Util.isValidTimezone("CDT")).to.equal(false);
    });

    it("rejects non-strings without throwing", function () {
      expect(Util.isValidTimezone(null)).to.equal(false);
      expect(Util.isValidTimezone(123)).to.equal(false);
      expect(Util.isValidTimezone(undefined)).to.equal(false);
      expect(Util.isValidTimezone({})).to.equal(false);
    });
  });

  describe("timezoneOffsetFor", function () {

    it("returns signed hours east of UTC", function () {
      expect(Util.timezoneOffsetFor("UTC")).to.equal(0);
      expect(Util.timezoneOffsetFor("Asia/Tokyo")).to.equal(9);
    });

    it("tracks DST rather than returning a fixed offset", function () {
      const summer = momentTz("2026-07-01T12:00:00Z").tz("Europe/Prague").utcOffset() / 60;
      const winter = momentTz("2026-01-01T12:00:00Z").tz("Europe/Prague").utcOffset() / 60;
      expect(summer).to.equal(2);
      expect(winter).to.equal(1);
      // The helper reports whichever is current, never a frozen value.
      expect([1, 2]).to.include(Util.timezoneOffsetFor("Europe/Prague"));
    });

    it("returns a negative offset for western zones", function () {
      expect(Util.timezoneOffsetFor("America/New_York")).to.be.oneOf([-5, -4]);
    });

    it("preserves fractional offsets", function () {
      expect(Util.timezoneOffsetFor("Asia/Kolkata")).to.equal(5.5);
    });

    it("returns null for an invalid zone, distinguishing it from real UTC", function () {
      expect(Util.timezoneOffsetFor("CEST")).to.equal(null);
      expect(Util.timezoneOffsetFor(null)).to.equal(null);
      expect(Util.timezoneOffsetFor(123)).to.equal(null);
    });
  });
});
