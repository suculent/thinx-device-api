/*
 * Privacy Policy Consistency Spec.
 *
 * Runs the dependency-free checker (scripts/privacy-policy-check.js) against the
 * working tree and enforces the claim -> code contract in CI. It asserts there
 * are NO FAIL-severity discrepancies: if the code that backs a hard policy
 * promise (GDPR deletion sweep, on-demand purge, transfer/consent endpoints,
 * API-key removal) disappears, this spec breaks.
 *
 * WARN-severity findings are DOCUMENTED drift and are explicitly allowed here
 * (see docs/PRIVACY_POLICY_CONSISTENCY.md) — notably the OAuth provider mismatch
 * (policy advertises Google/Twitter, code implements GitHub only) and the
 * cross-document drift between privacy.html and static/gdpr.html.
 *
 * No live services (Redis, CouchDB, MQTT) are required — the checker only reads
 * the repository files.
 */

var expect = require('chai').expect;
var checker = require('../../scripts/privacy-policy-check');

describe("Privacy Policy Consistency", function () {

	var outcome;

	beforeAll(function () {
		console.log("🚸 [chai] >>> running Privacy Policy Consistency spec");
		outcome = checker.check();
	});

	afterAll(function () {
		console.log("🚸 [chai] <<< completed Privacy Policy Consistency spec");
	});

	it("produces a result for every claim in the manifest", function () {
		expect(outcome.results.length).to.be.greaterThan(0);
		// manifest claims + 2 cross-cutting checks (oauth parity, cross-document)
		expect(outcome.results.length).to.equal(checker.CLAIMS.length + 2);
	});

	it("has no FAIL-severity discrepancies (documented WARNs are allowed)", function () {
		var fails = outcome.results.filter(function (r) { return r.status === "FAIL"; });
		if (fails.length > 0) {
			console.log("☣️ [error] privacy policy FAIL findings:", JSON.stringify(fails, null, 2));
		}
		expect(outcome.counts.FAIL).to.equal(0);
		expect(outcome.ok).to.equal(true);
	});

	it("surfaces the known OAuth provider mismatch as a WARN", function () {
		var oauth = outcome.results.find(function (r) { return r.id === "oauth-provider-parity"; });
		expect(oauth).to.not.equal(undefined);
		expect(oauth.status).to.equal("WARN");
		// The headline discrepancy: providers advertised but not implemented.
		var advertisedButMissing = oauth.evidence.some(function (e) {
			return e.indexOf("advertised but NOT implemented") !== -1;
		});
		expect(advertisedButMissing).to.equal(true);
	});

	it("verifies the hard GDPR endpoint/backing-code contracts pass", function () {
		var mustPass = [
			"apikeys-deleted-with-devices",
			"data-transfer-json-export",
			"gdpr-consent-endpoint",
			"personal-data-24h-deletion",
			"retained-queues-invalidated"
		];
		mustPass.forEach(function (id) {
			var claim = outcome.results.find(function (r) { return r.id === id; });
			expect(claim, "missing claim result: " + id).to.not.equal(undefined);
			expect(claim.status, id + " should PASS but was " + (claim && claim.status)).to.equal("PASS");
		});
	});
});
