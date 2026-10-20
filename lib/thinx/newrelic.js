/**
 * Optional New Relic APM loader (quick 261013-kvm).
 *
 * thinx.js calls start() on its very first line, before thinx-core.js loads.
 * The agent must be loaded before express, http, redis and the rest so it can
 * instrument them; anything loaded earlier is invisible to it.
 *
 * start() is a no-op in tests and CI (ENVIRONMENT=test, CI or CIRCLECI) and
 * does not even read the key there. Otherwise the license key comes from
 * readSecret("NEW_RELIC_LICENSE_KEY") (/run/secrets first, then env). Without
 * a key it logs one info line and returns, so detaching the swarm secret is
 * the kill switch. With a key it writes the hardened NEW_RELIC_* settings and
 * then loads the agent inside try/catch: a load failure logs one line and the
 * API keeps starting. The key itself is never logged.
 *
 * Nothing runs at load time; only start() does anything, so a spec or tool
 * that loads this module cannot start the real agent by accident.
 *
 * Depends only on ./secrets (fs/path only), so it is safe to load first.
 */

const secrets = require("./secrets");

const DISABLED_LINE = "ℹ️ [info] [newrelic] NEW_RELIC_LICENSE_KEY not set, New Relic disabled";
const APP_NAME_DEFAULT = "THiNX";
const ATTRIBUTES_EXCLUDE = [
	"request.headers.cookie",
	"request.headers.authorization",
	"request.headers.proxyAuthorization",
	"request.headers.setCookie*",
	"response.headers.setCookie*",
	"request.parameters.*"
].join(",");
const MESSAGE_MAX = 200;

function isSet(value) {
	return typeof value === "string" && value.length > 0;
}

// Builds a single redacted "code: message" description of a load failure.
function describeFailure(err, key) {
	let code = "Error";
	let message = "";
	if (err !== null && typeof err === "object") {
		if (isSet(err.code)) {
			code = err.code;
		} else if (isSet(err.name)) {
			code = err.name;
		}
		message = (typeof err.message === "string") ? err.message : String(err);
	} else {
		message = String(err);
	}
	message = message.split(/\r?\n/)[0];
	code = String(code).split(key).join("[redacted]");
	message = message.split(key).join("[redacted]");
	if (message.length > MESSAGE_MAX) message = message.substring(0, MESSAGE_MAX);
	return code + ": " + message;
}

function start(deps) {
	deps = deps || {};
	const env = deps.env || process.env;
	const readSecret = deps.readSecret || secrets.readSecret;
	const requireAgent = deps.requireAgent || (() => require("newrelic"));
	const log = deps.log || ((line) => console.log(line));

	// D-02: tests and CI never read the key and never load the agent.
	if (env.ENVIRONMENT === "test" || isSet(env.CI) || isSet(env.CIRCLECI)) {
		return "skipped";
	}

	// D-03: no key, no agent.
	const raw = readSecret("NEW_RELIC_LICENSE_KEY");
	const key = (typeof raw === "string") ? raw.trim() : "";
	if (key === "") {
		log(DISABLED_LINE);
		return "disabled";
	}

	// D-04: every setting is written before the agent loads. The hardening
	// settings overwrite any existing value; only the app name is kept.
	env.NEW_RELIC_LICENSE_KEY = key;
	if (!isSet(env.NEW_RELIC_APP_NAME)) env.NEW_RELIC_APP_NAME = APP_NAME_DEFAULT;
	env.NEW_RELIC_NO_CONFIG_FILE = "true";
	env.NEW_RELIC_LOG = "stdout";
	env.NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED = "false";
	env.NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED = "true";
	env.NEW_RELIC_ATTRIBUTES_EXCLUDE = ATTRIBUTES_EXCLUDE;

	// D-05: a load failure must never stop the API from starting.
	try {
		requireAgent();
	} catch (err) {
		log("☣️ [error] [newrelic] agent failed to load, New Relic disabled: " + describeFailure(err, key));
		return "failed";
	}
	log("ℹ️ [info] [newrelic] agent loaded, app name " + env.NEW_RELIC_APP_NAME);
	return "started";
}

module.exports = { start };
