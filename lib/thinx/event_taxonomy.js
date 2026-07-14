/*
 * This THiNX Device Management API module is the single source of truth for the
 * event taxonomy: the canonical set of tracked events, their category, a severity
 * flag, and a human description.
 *
 * The event NAMES are load-bearing strings that are persisted verbatim into
 * InfluxDB (as measurement names) and appear in CouchDB audit logs / container
 * log lines parsed by statistics.js. They MUST NOT be renamed here — doing so
 * would orphan historical measurements and break the log parser. This module
 * only centralizes the previously-duplicated definitions; it does not rename.
 *
 * Consumers:
 *   - statistics.js  — owner_template data model + log-line parser
 *   - influx.js       — measurements() list used for daily/weekly KPI queries
 *   - emission sites  — apikey.js, builder.js, device.js, devices.js, notifier.js
 */

// Ordered list of canonical event descriptors. Order is preserved everywhere
// the taxonomy is projected (template model, measurements list) so that the
// statistics data model keeps a stable, predictable key order.
const EVENTS = Object.freeze([
	{ name: "APIKEY_INVALID", category: "security", flag: "error", description: "An invalid API key was presented." },
	{ name: "LOGIN_INVALID", category: "security", flag: "warning", description: "A login attempt failed (bad credentials / not activated)." },
	{ name: "DEVICE_NEW", category: "device", flag: "info", description: "A new device registered." },
	{ name: "DEVICE_CHECKIN", category: "device", flag: "info", description: "An existing device checked in." },
	{ name: "DEVICE_REVOCATION", category: "device", flag: "warning", description: "A device was revoked / deleted." },
	{ name: "BUILD_STARTED", category: "build", flag: "info", description: "A firmware build started." },
	{ name: "BUILD_SUCCESS", category: "build", flag: "success", description: "A firmware build completed successfully." },
	{ name: "BUILD_FAILED", category: "build", flag: "error", description: "A firmware build failed." }
].map(Object.freeze));

// Ordered array of canonical event names.
function names() {
	return EVENTS.map((event) => event.name);
}

// Frozen constants object for reference at emission sites, e.g.
// EventTaxonomy.NAMES.BUILD_STARTED instead of the bare "BUILD_STARTED" literal.
const NAMES = Object.freeze(
	EVENTS.reduce((acc, event) => {
		acc[event.name] = event.name;
		return acc;
	}, {})
);

// Builds the statistics owner_template data model: { EVENT: [0], ... }.
// A fresh object (with fresh counter arrays) is returned on every call so that
// per-owner counters never share array references.
function templateModel() {
	const model = {};
	for (const event of EVENTS) {
		model[event.name] = [0];
	}
	return model;
}

// Map of event name -> category.
function categories() {
	return EVENTS.reduce((acc, event) => {
		acc[event.name] = event.category;
		return acc;
	}, {});
}

// Map of event name -> severity flag.
function flags() {
	return EVENTS.reduce((acc, event) => {
		acc[event.name] = event.flag;
		return acc;
	}, {});
}

module.exports = {
	EVENTS,
	NAMES,
	names,
	templateModel,
	categories,
	flags
};
