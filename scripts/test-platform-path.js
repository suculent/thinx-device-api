#!/usr/bin/env node
/**
 * Plain-node guard test for the platform/descriptor path containment
 * (SEC: builder.js require(variable) + json2h.js path traversal).
 *
 * The jasmine suite in spec/ is Docker-gated (it needs CouchDB, Redis and the
 * installed node_modules), so this file exercises the pure validation helpers
 * with nothing but core node:
 *
 *     node scripts/test-platform-path.js
 *
 * Exits non-zero on the first failing expectation.
 */

const Module = require("module");
const path = require("path");
const fs = require("fs");

// json2h requires ./util (-> ./sanitka, typeof, moment-timezone) and fs-extra.
// node_modules only exist inside the Docker test image, so stub the leaves;
// none of them is touched by the code under test.
const stubs = {
	"fs-extra": fs,
	"typeof": function () { return "object"; },
	"moment-timezone": {},
	"./sanitka": class Sanitka { }
};

const original_load = Module._load;
Module._load = function (request, parent, isMain) {
	if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
	return original_load(request, parent, isMain);
};

const REPO_ROOT = path.resolve(__dirname, "..");
const PLATFORMS_ROOT = path.join(REPO_ROOT, "platforms");

const JSON2H = require(path.join(REPO_ROOT, "lib", "thinx", "json2h.js"));

let failures = 0;
let checks = 0;

function check(description, actual, expected) {
	checks++;
	const ok = (actual === expected);
	if (!ok) {
		failures++;
		console.log(`FAIL ${description}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
	} else {
		console.log(`ok   ${description}`);
	}
}

console.log(`# platforms root: ${PLATFORMS_ROOT}`);
console.log(`# descriptor root: ${JSON2H.descriptorRoot()}`);

// --- accepted --------------------------------------------------------------

check("'platformio' accepted",
	JSON2H.safeDirectory(PLATFORMS_ROOT, "platformio"),
	path.join(PLATFORMS_ROOT, "platformio"));

check("'platformio:esp8266' accepted via basePlatform",
	JSON2H.validatedPlatformDirectory(PLATFORMS_ROOT, "platformio:esp8266"),
	path.join(PLATFORMS_ROOT, "platformio"));

check("'nodemcu' accepted",
	JSON2H.safeDirectory(PLATFORMS_ROOT, "nodemcu"),
	path.join(PLATFORMS_ROOT, "nodemcu"));

// every real platform directory still resolves (no hardcoded list anywhere)
const real_platforms = fs.readdirSync(PLATFORMS_ROOT, { withFileTypes: true })
	.filter((e) => e.isDirectory()).map((e) => e.name);
check("all real platform directories accepted",
	real_platforms.every((p) => JSON2H.safeDirectory(PLATFORMS_ROOT, p) === path.join(PLATFORMS_ROOT, p)),
	true);

// --- rejected --------------------------------------------------------------

const rejected = [
	["'../../etc' rejected", "../../etc"],
	["'..%2f..' rejected", "..%2f.."],
	["'nodemcu/../../..' rejected", "nodemcu/../../.."],
	["'..' rejected", ".."],
	["'.' rejected", "."],
	["absolute '/etc' rejected", "/etc"],
	["'platformio/../../languages' rejected", "platformio/../../languages"],
	["nul-byte 'platformio\\0' rejected", "platformio\0"],
	["empty string rejected", ""],
	["non-existent 'no-such-platform' rejected", "no-such-platform"],
	["case-mismatch 'PlatformIO' rejected", "PlatformIO"],
	["trailing-slash 'platformio/' rejected", "platformio/"]
];

for (const [description, candidate] of rejected) {
	check(description, JSON2H.safeDirectory(PLATFORMS_ROOT, candidate), null);
}

check("null rejected", JSON2H.safeDirectory(PLATFORMS_ROOT, null), null);
check("undefined rejected", JSON2H.safeDirectory(PLATFORMS_ROOT, undefined), null);
check("number rejected", JSON2H.safeDirectory(PLATFORMS_ROOT, 42), null);
check("unreadable root rejected", JSON2H.safeDirectory("/nonexistent-root-xyz", "platformio"), null);

check("validatedPlatformDirectory('../../etc') rejected",
	JSON2H.validatedPlatformDirectory(PLATFORMS_ROOT, "../../etc"), null);
check("validatedPlatformDirectory('../../etc:esp8266') rejected",
	JSON2H.validatedPlatformDirectory(PLATFORMS_ROOT, "../../etc:esp8266"), null);
check("validatedPlatformDirectory(null) rejected",
	JSON2H.validatedPlatformDirectory(PLATFORMS_ROOT, null), null);
check("validatedPlatformDirectory('') rejected",
	JSON2H.validatedPlatformDirectory(PLATFORMS_ROOT, ""), null);

// --- readDescriptor --------------------------------------------------------

const platform_descriptor = JSON2H.readDescriptor("platforms", "platformio");
check("readDescriptor('platforms','platformio') returns an object",
	(platform_descriptor !== null) && (typeof platform_descriptor === "object"), true);

check("readDescriptor('platforms','../../etc') returns null",
	JSON2H.readDescriptor("platforms", "../../etc"), null);

check("readDescriptor('platforms','nodemcu/../../..') returns null",
	JSON2H.readDescriptor("platforms", "nodemcu/../../.."), null);

check("readDescriptor with traversing kind returns null",
	JSON2H.readDescriptor("../../etc", "passwd"), null);

check("readDescriptor with unknown kind returns null",
	JSON2H.readDescriptor("builders", "platformio"), null);

check("readDescriptor(null, null) returns null",
	JSON2H.readDescriptor(null, null), null);

const language_descriptor = JSON2H.readDescriptor("languages", "c");
check("readDescriptor('languages','c') returns an object",
	(language_descriptor !== null) && (typeof language_descriptor === "object"), true);

// --- end-to-end through the public API -------------------------------------

check("languageForPlatform('platformio:esp8266') resolves",
	typeof JSON2H.languageForPlatform("platformio:esp8266"), "string");

check("languageForPlatform('../../etc') is null",
	JSON2H.languageForPlatform("../../etc"), null);

check("languageNameForPlatform('../../etc') is <unknown-language>",
	JSON2H.languageNameForPlatform("../../etc"), "<unknown-language>");

check("languageNameForPlatform('nodemcu') resolves to a name",
	typeof JSON2H.languageNameForPlatform("nodemcu"), "string");

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
	console.log(`${failures} FAILED`);
	process.exit(1);
}
process.exit(0);
