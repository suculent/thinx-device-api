"use strict";

// Log-injection guard: turns a request-derived value into one printable log token.
// Line breaks are removed and other control characters replaced, so a client cannot forge
// a second log line; long values are cut. No dependencies, so any module (including
// sanitka and the middleware) can require it without a cycle.

const MAX_LENGTH = 200;

function toText(value) {
	if (typeof value === "string") return value;
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (value instanceof Error) return value.name + ": " + value.message;
	if (typeof value === "object") {
		try {
			const json = JSON.stringify(value);
			return (typeof json === "string") ? json : Object.prototype.toString.call(value);
		} catch (_e) {
			return Object.prototype.toString.call(value);
		}
	}
	return String(value);
}

/**
 * @param {*} value any value that may carry request data
 * @param {number} [max] longest result to keep (default 200)
 * @returns {string} single-line, control-character-free text
 */
function logSafe(value, max) {
	const limit = (typeof max === "number" && max > 0) ? max : MAX_LENGTH;
	let text = toText(value).replace(/\n|\r/g, ""); // empty replacement: the form static analysers accept as the line-break barrier
	// eslint-disable-next-line no-control-regex
	text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, "?");
	return (text.length > limit) ? text.slice(0, limit) + "…" : text;
}

module.exports = logSafe;
