/**
 * Docker Secrets support (#418 / SEC-CFG-01).
 *
 * readSecret(name) resolves a credential by preferring a Docker secret file
 * (`/run/secrets/<name>`, as mounted by `docker stack deploy` in swarm mode)
 * over the `process.env[name]` value, with an env fallback for backward
 * compatibility with the existing `.env` workflow. Results are cached so the
 * filesystem is probed at most once per name.
 *
 * Intentionally depends only on `fs` — no Globals/config — so it is safe to use
 * from foundational modules (globals.js, database.js) without a require cycle.
 */

const fs = require("fs");
const path = require("path");

const SECRETS_DIR = "/run/secrets/";
const cache = {};

function readSecret(name, defaultValue) {
	if (typeof defaultValue === "undefined") defaultValue = null;
	if (Object.prototype.hasOwnProperty.call(cache, name)) return cache[name];

	let value = defaultValue;
	try {
		const base = path.resolve(SECRETS_DIR);
		const secret_path = path.resolve(base, name);
		const relative = path.relative(base, secret_path);
		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new Error("Invalid secret name");
		}
		if (fs.existsSync(secret_path)) {
			value = fs.readFileSync(secret_path, "utf8").trim();
		} else if (typeof process.env[name] !== "undefined") {
			value = process.env[name];
		}
	} catch (_e) {
		// secret file unreadable — fall back to env, else default
		if (typeof process.env[name] !== "undefined") value = process.env[name];
	}

	cache[name] = value;
	return value;
}

// Test seam: clear the per-name cache between cases.
function _resetCacheForTests() {
	for (const k in cache) delete cache[k];
}

module.exports = { readSecret, _resetCacheForTests };
