/*
 * lib/thinx/couch.js — callback-compatible wrapper around nano >= 11.
 *
 * nano 11 removed callback support (promise-only API). This codebase still
 * has ~50 callback-style call sites (userlib.get(id, (err, body) => ...))
 * and `database.js` init relies on `nano.db.list(cb)`. With a plain nano 11
 * client those callbacks never fire, so the app never finishes booting (CI:
 * every spec "Not run because a beforeAll function failed").
 *
 * This module returns a nano client whose functions accept an optional
 * trailing callback with nano 10 semantics:
 *   - cb(err)                    on rejection (nano Error: statusCode, error, reason)
 *   - cb(null, body, undefined)  on success (nano 11 no longer exposes response
 *                                headers, so the third argument is always undefined)
 * Without a trailing function the call passes straight through and returns the
 * promise, so existing .then()/await call sites are unaffected.
 *
 * Usage: replace require("./couch")(uri) with require("./couch")(uri).
 */

const nano = require("nano");

// Stream-returning helpers are not promise-based; leave them untouched.
function isPassthrough(name, value) {
	return typeof value !== "function" || /AsStream$/.test(name);
}

function callbackify(target, fn) {
	return function (...args) {
		const last = args[args.length - 1];
		if (typeof last !== "function") return fn.apply(target, args);
		const cb = args.pop();
		let p;
		try {
			p = Promise.resolve(fn.apply(target, args));
		} catch (e) {
			p = Promise.reject(e);
		}
		p.then((body) => cb(null, body, undefined), (err) => cb(err));
		return undefined;
	};
}

// Shallow copy of `target` with every own function callbackified.
// Non-function values (config, changesReader, server back-reference) are
// copied by reference; `overrides` replaces named keys verbatim.
function wrapObject(target, overrides) {
	const out = {};
	for (const name of Object.keys(target)) {
		const value = target[name];
		if (overrides && Object.prototype.hasOwnProperty.call(overrides, name)) {
			out[name] = overrides[name];
		} else if (isPassthrough(name, value)) {
			out[name] = value;
		} else {
			out[name] = callbackify(target, value);
		}
	}
	return out;
}

function wrapScope(scope) {
	const overrides = {};
	if (scope.attachment && typeof scope.attachment === "object") overrides.attachment = wrapObject(scope.attachment);
	if (scope.multipart && typeof scope.multipart === "object") overrides.multipart = wrapObject(scope.multipart);
	return wrapObject(scope, overrides);
}

function wrapClient(client) {
	const use = (name) => wrapScope(client.db.use(name));
	const db = wrapObject(client.db, { use, scope: use });
	return wrapObject(client, { db, use, scope: use });
}

module.exports = function couch(uri) {
	return wrapClient(nano(uri));
};

module.exports.wrapClient = wrapClient;
module.exports.callbackify = callbackify;
