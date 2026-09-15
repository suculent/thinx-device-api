#!/usr/bin/env node
/**
 * Privacy Policy Consistency Checker (dependency-free).
 *
 * Mechanically verifies the concrete, machine-checkable claims made in the
 * THiNX privacy policy against the code that is supposed to implement them.
 *
 * It is driven by a data manifest (CLAIMS below): each entry pairs a policy
 * sentence with the implementation signal that must exist for the promise to
 * hold (a file, an Express route string, or a keyword in a specific file), plus
 * a severity that decides whether a missing signal is a hard FAIL (the backing
 * code vanished — CI must break) or a soft WARN (documented drift we tolerate).
 *
 * Two cross-cutting checks run in addition to the manifest:
 *   - OAuth provider drift: provider names advertised in the policy text but
 *     absent from the OAuth implementation (currently the policy names Google
 *     and Twitter; the code implements GitHub + Google, so Twitter is missing).
 *   - Cross-document drift: material claims that diverge between the two policy
 *     copies (privacy.html vs static/gdpr.html).
 *
 * Usage:
 *   node scripts/privacy-policy-check.js          # human report + exit code
 *   const { check } = require('./scripts/privacy-policy-check'); check();
 *
 * Exit code is non-zero when any FAIL-severity discrepancy is found, so it is
 * usable both as a CI gate and from the jasmine suite. Only node built-ins are
 * required (fs, path) so it runs with no server, database, or network.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

// Source-of-truth policy documents.
const PRIVACY_HTML = "services/console/src/public/privacy.html";
const GDPR_HTML = "static/gdpr.html";

// Severity levels, most severe first.
const FAIL = "FAIL";
const WARN = "WARN";
const PASS = "PASS";

// --- tiny filesystem helpers (repo-relative, cached reads) -----------------

const _cache = {};

function abs(relPath) {
	return path.join(REPO_ROOT, relPath);
}

function fileExists(relPath) {
	try {
		return fs.statSync(abs(relPath)).isFile();
	} catch (_e) {
		return false;
	}
}

function readFile(relPath) {
	if (Object.prototype.hasOwnProperty.call(_cache, relPath)) return _cache[relPath];
	let content = null;
	try {
		content = fs.readFileSync(abs(relPath), "utf8");
	} catch (_e) {
		content = null;
	}
	_cache[relPath] = content;
	return content;
}

/** True when `relPath` exists and contains the given string or matches the RegExp. */
function fileContains(relPath, needle) {
	const content = readFile(relPath);
	if (content === null) return false;
	if (needle instanceof RegExp) return needle.test(content);
	return content.indexOf(needle) !== -1;
}

/** True when `relPath` registers an Express route for `method` + `routePath`. */
function routeExists(relPath, method, routePath) {
	const content = readFile(relPath);
	if (content === null) return false;
	// Matches app.delete("/api/v2/gdpr" ... allowing single or double quotes.
	const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp("\\.\\s*" + method.toLowerCase() + "\\s*\\(\\s*[\"']" + escaped + "[\"']");
	return re.test(content);
}

// --- claims manifest (the claim -> code contract, as data) -----------------

const CLAIMS = [
	{
		id: "personal-data-24h-deletion",
		policy: "All the personal data are marked as deleted ... and removed from system until 24 hours from such request.",
		source: PRIVACY_HTML,
		implementation: "lib/thinx/gdpr.js (scheduled expiry sweep) + lib/thinx/owner_purge.js (orchestrated purge)",
		severity: FAIL,
		signals: [
			{ kind: "file", file: "lib/thinx/gdpr.js" },
			{ kind: "file", file: "lib/thinx/owner_purge.js" },
			{ kind: "keyword", file: "lib/thinx/gdpr.js", needle: /purgeOldUsers|purgeIfExpired/, label: "scheduled purge sweep" },
			{ kind: "keyword", file: "lib/thinx/gdpr.js", needle: /notify24|24/, label: "24h notification window" }
		]
	},
	{
		id: "apikeys-deleted-with-devices",
		policy: "API keys are deleted with devices, when customer requests GDPR Data Deletion.",
		source: PRIVACY_HTML,
		implementation: "lib/thinx/owner_purge.js (Redis 'ak:' key deletion + device revoke), DELETE /api/v2/gdpr",
		severity: FAIL,
		signals: [
			{ kind: "keyword", file: "lib/thinx/owner_purge.js", needle: '"ak:"', label: "Redis API-key bucket deletion" },
			{ kind: "keyword", file: "lib/thinx/owner_purge.js", needle: /_revokeDevices/, label: "device revocation step" },
			{ kind: "route", file: "lib/router.gdpr.js", method: "delete", route: "/api/v2/gdpr", label: "on-demand deletion endpoint" }
		]
	},
	{
		id: "retained-queues-invalidated",
		policy: "Data queues with retained messages are invalidated on account revocation.",
		source: PRIVACY_HTML,
		implementation: "lib/thinx/owner_purge.js (_revokeDevices -> devices.revoke, MQTT credential revocation)",
		severity: FAIL,
		signals: [
			{ kind: "keyword", file: "lib/thinx/owner_purge.js", needle: /revoke/, label: "revocation on purge" },
			{ kind: "keyword", file: "lib/thinx/devices.js", needle: /revoke_mqtt_credentials|revoke/, label: "MQTT credential revocation" }
		]
	},
	{
		id: "data-transfer-json-export",
		policy: "Any individual can transfer their personal, device and environment data ... provided as-is in standard JSON format.",
		source: PRIVACY_HTML,
		implementation: "lib/router.gdpr.js (transferGDPR, POST /api/v2/gdpr) returning user/device/environment JSON",
		severity: FAIL,
		signals: [
			{ kind: "route", file: "lib/router.gdpr.js", method: "post", route: "/api/v2/gdpr", label: "data transfer endpoint" },
			{ kind: "keyword", file: "lib/router.gdpr.js", needle: /transferGDPR/, label: "transfer handler" },
			{ kind: "keyword", file: "lib/router.gdpr.js", needle: /user_data|device_data|environment/, label: "JSON export payload" }
		]
	},
	{
		id: "gdpr-consent-endpoint",
		policy: "By using our Site, you signify your acceptance of this policy (consent capture / withdrawal).",
		source: PRIVACY_HTML,
		implementation: "lib/router.gdpr.js (setGDPR, PUT /api/v2/gdpr) storing gdpr_consent",
		severity: FAIL,
		signals: [
			{ kind: "route", file: "lib/router.gdpr.js", method: "put", route: "/api/v2/gdpr", label: "consent endpoint" },
			{ kind: "keyword", file: "lib/router.gdpr.js", needle: /gdpr_consent/, label: "consent persistence" }
		]
	},
	{
		id: "ip-logging-malicious-requests",
		policy: "We're also logging IP addresses of malicous and invalid requests for further investigation ...",
		source: PRIVACY_HTML,
		implementation: "lib/thinx/logger.js (shared Winston logger; warn+ persisted to statistics log)",
		// Soft: the logging infrastructure exists, but there is no dedicated
		// 'log the client IP of a malicious request' path, so the specific
		// promise is only partially backed. Surfaced, not enforced.
		severity: WARN,
		signals: [
			{ kind: "file", file: "lib/thinx/logger.js" },
			{ kind: "keyword", file: "lib/thinx/logger.js", needle: /ip\b|address|remoteAddress|x-forwarded/i, label: "client-IP logging path" }
		]
	},
	{
		id: "cookies-usage",
		policy: "Our Site may use \"cookies\" to enhance User experience.",
		source: PRIVACY_HTML,
		implementation: "cookie-parser middleware / session cookies (lib/router.js auth path)",
		severity: WARN,
		signals: [
			{ kind: "keyword", file: "lib/router.js", needle: /cookie/i, label: "cookie handling" }
		]
	},
	{
		id: "no-selling-pii",
		policy: "We do not sell, trade, or rent Users personal identification information to others.",
		source: PRIVACY_HTML,
		implementation: "Policy commitment; no data-broker / sale integration is expected to exist in code.",
		// Verified by ABSENCE: presence of a selling/monetization integration
		// would contradict the policy. We flag if such a signal appears.
		severity: WARN,
		absence: [
			{ file: "lib/thinx/transfer.js", needle: /sell|resell|broker|monetiz/i, label: "no data-sale code in transfer module" }
		]
	}
];

// --- evaluation ------------------------------------------------------------

function evaluateSignal(sig) {
	if (sig.kind === "file") {
		return { ok: fileExists(sig.file), detail: sig.file + (fileExists(sig.file) ? " present" : " MISSING") };
	}
	if (sig.kind === "keyword") {
		const ok = fileContains(sig.file, sig.needle);
		return { ok, detail: (sig.label || "keyword") + " in " + sig.file + (ok ? " found" : " NOT found") };
	}
	if (sig.kind === "route") {
		const ok = routeExists(sig.file, sig.method, sig.route);
		return { ok, detail: sig.method.toUpperCase() + " " + sig.route + " in " + sig.file + (ok ? " registered" : " NOT registered") };
	}
	return { ok: false, detail: "unknown signal kind: " + sig.kind };
}

function evaluateClaim(claim) {
	const evidence = [];
	let allOk = true;

	for (const sig of claim.signals || []) {
		const r = evaluateSignal(sig);
		evidence.push(r.detail);
		if (!r.ok) allOk = false;
	}

	// "Verified by absence" claims: presence of the needle is the problem.
	for (const a of claim.absence || []) {
		const present = fileContains(a.file, a.needle);
		evidence.push((a.label || "absence") + ": " + (present ? "unexpected match in " + a.file : "clear"));
		if (present) allOk = false;
	}

	return {
		id: claim.id,
		policy: claim.policy,
		source: claim.source,
		implementation: claim.implementation,
		status: allOk ? PASS : claim.severity,
		evidence
	};
}

// --- cross-cutting check: OAuth provider drift -----------------------------

// Providers the codebase actually implements are discovered from the OAuth
// implementation/route files (oauth-<provider>.js under lib/thinx and
// router.<provider>.js under lib), so the checker stays correct as providers
// are added or removed. Only files that are actually mounted in thinx-core.js
// count as implemented routers.
function implementedOAuthProviders() {
	const found = new Set();

	// lib/thinx/oauth-<provider>.js
	try {
		for (const f of fs.readdirSync(abs("lib/thinx"))) {
			const m = /^oauth-([a-z0-9]+)\.js$/i.exec(f);
			if (m) found.add(m[1].toLowerCase());
		}
	} catch (_e) { /* ignore */ }

	// lib/router.<provider>.js — require it to be wired into thinx-core.js so a
	// dangling, unmounted router does not count as "implemented".
	const core = readFile("thinx-core.js") || "";
	try {
		for (const f of fs.readdirSync(abs("lib"))) {
			const m = /^router\.([a-z0-9]+)\.js$/i.exec(f);
			if (!m) continue;
			const provider = m[1].toLowerCase();
			if (KNOWN_PROVIDERS.indexOf(provider) === -1) continue; // skip non-OAuth routers
			if (core.indexOf("router." + provider + ".js") !== -1) found.add(provider);
		}
	} catch (_e) { /* ignore */ }

	return Array.from(found);
}

// Provider names the policy text advertises to users.
const KNOWN_PROVIDERS = ["google", "twitter", "github", "gitlab", "facebook", "apple"];

function oauthProviderDrift() {
	const policyText = (readFile(PRIVACY_HTML) || "") + "\n" + (readFile(GDPR_HTML) || "");
	const implemented = implementedOAuthProviders();

	// Match "OAuth provider (Google, Twitter)" style mentions in the policy.
	const advertised = KNOWN_PROVIDERS.filter((p) => new RegExp("\\b" + p + "\\b", "i").test(policyText));

	const missing = advertised.filter((p) => implemented.indexOf(p) === -1);

	const evidence = [
		"policy advertises OAuth providers: " + (advertised.length ? advertised.join(", ") : "(none)"),
		"code implements OAuth providers: " + (implemented.length ? implemented.join(", ") : "(none)")
	];
	if (missing.length) {
		evidence.push("advertised but NOT implemented: " + missing.join(", "));
	}

	return {
		id: "oauth-provider-parity",
		policy: "Users ... data will be requested from respective OAuth provider (Google, Twitter).",
		source: PRIVACY_HTML,
		implementation: "lib/router.github.js + lib/thinx/oauth-github.js (GitHub), lib/router.google.js (Google)",
		status: missing.length ? WARN : PASS,
		evidence
	};
}

// --- cross-cutting check: cross-document drift -----------------------------

function firstEmail(text) {
	const m = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.exec(text || "");
	return m ? m[0] : null;
}

function crossDocumentDrift() {
	const a = readFile(PRIVACY_HTML) || "";
	const b = readFile(GDPR_HTML) || "";
	const evidence = [];
	let drift = false;

	if (!b) {
		return {
			id: "cross-document-consistency",
			policy: "The two policy copies (privacy.html, gdpr.html) should agree on material claims.",
			source: PRIVACY_HTML + " vs " + GDPR_HTML,
			implementation: "n/a (document-to-document check)",
			status: WARN,
			evidence: [GDPR_HTML + " missing or unreadable"]
		};
	}

	// Contact email parity.
	const emailA = firstEmail(a);
	const emailB = firstEmail(b);
	if (emailA && emailA !== emailB) {
		drift = true;
		evidence.push("contact email diverges: " + PRIVACY_HTML + "=" + emailA + ", " + GDPR_HTML + "=" + (emailB || "(none)"));
	}

	// Retention window parity (24 hours).
	const retA = /24\s*hours?/i.test(a);
	const retB = /24\s*hours?/i.test(b);
	if (retA !== retB) {
		drift = true;
		evidence.push("24-hour retention window stated in " + (retA ? PRIVACY_HTML : GDPR_HTML) + " but not the other copy");
	}

	// OAuth provider mention parity.
	const provA = KNOWN_PROVIDERS.filter((p) => new RegExp("\\b" + p + "\\b", "i").test(a));
	const provB = KNOWN_PROVIDERS.filter((p) => new RegExp("\\b" + p + "\\b", "i").test(b));
	if (provA.sort().join(",") !== provB.sort().join(",")) {
		drift = true;
		evidence.push("OAuth providers differ between copies: " + PRIVACY_HTML + "=[" + provA.join(",") + "], " + GDPR_HTML + "=[" + provB.join(",") + "]");
	}

	if (!drift) evidence.push("material claims (contact email, retention window, providers) agree across copies");

	return {
		id: "cross-document-consistency",
		policy: "The two policy copies (privacy.html, gdpr.html) should agree on material claims.",
		source: PRIVACY_HTML + " vs " + GDPR_HTML,
		implementation: "n/a (document-to-document check)",
		status: drift ? WARN : PASS,
		evidence
	};
}

// --- driver ----------------------------------------------------------------

/**
 * Run all checks.
 * @returns {{ results: Array, counts: {PASS:number, WARN:number, FAIL:number}, ok: boolean }}
 */
function check() {
	const results = CLAIMS.map(evaluateClaim);
	results.push(oauthProviderDrift());
	results.push(crossDocumentDrift());

	const counts = { PASS: 0, WARN: 0, FAIL: 0 };
	for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;

	return { results, counts, ok: counts.FAIL === 0 };
}

function report(outcome) {
	const lines = [];
	lines.push("Privacy Policy Consistency Checker");
	lines.push("==================================");
	lines.push("");
	for (const r of outcome.results) {
		lines.push("[" + r.status + "] " + r.id);
		lines.push("  policy:  " + r.policy);
		lines.push("  source:  " + r.source);
		lines.push("  impl:    " + r.implementation);
		for (const e of r.evidence) lines.push("    - " + e);
		lines.push("");
	}
	lines.push("Summary: " + outcome.counts.PASS + " PASS, " + outcome.counts.WARN + " WARN, " + outcome.counts.FAIL + " FAIL");
	return lines.join("\n");
}

module.exports = { check, report, CLAIMS };

// Run directly: print the report and exit non-zero on any FAIL.
if (require.main === module) {
	const outcome = check();
	process.stdout.write(report(outcome) + "\n");
	process.exit(outcome.ok ? 0 : 1);
}
