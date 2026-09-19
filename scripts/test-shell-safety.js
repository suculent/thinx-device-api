#!/usr/bin/env node
/*
 * Shell-safety regression test for the git command path.
 *
 * Covers:
 *   1. lib/thinx/sanitka.js  -- branch()/url() are allowlists
 *   2. lib/thinx/sources.js  -- Sources.prefetchCommand()
 *   3. lib/thinx/devices.js  -- Devices.gitPrefetchCommand()
 *
 * Both builders produce a shell script string that ends up in
 * exec.execSync() (lib/thinx/git.js:71). The builder tests do not merely
 * inspect the string: they RUN it through /bin/sh with a fake `git` on PATH
 * that records its argv, then assert that a hostile branch/URL arrived as one
 * literal argv entry and that none of its embedded commands executed.
 *
 * The jasmine suite (spec/jasmine/SanitkaSpec.js) is docker-gated; this file
 * is plain node with no npm dependencies and is meant to be runnable anywhere:
 *
 *     node scripts/test-shell-safety.js      # exit 0 = pass, 1 = fail
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const Module = require("module");

const REPO_ROOT = path.resolve(__dirname, "..");

// --------------------------------------------------------------------------
// shell-escape stand-in
//
// node_modules is not always installed next to a checkout. When the real
// package is present it is used; otherwise this is a byte-for-byte
// reimplementation of shell-escape@0.2.0, the version pinned in package.json.
// --------------------------------------------------------------------------
let shellEscape;
try {
	shellEscape = require("shell-escape");
	console.log("[info] using installed shell-escape");
} catch (_e) {
	shellEscape = function (a) {
		var ret = [];
		a.forEach(function (s) {
			if (/[^A-Za-z0-9_/:=-]/.test(s)) {
				s = "'" + s.replace(/'/g, "'\\''") + "'";
				s = s.replace(/^(?:'')+/g, "").replace(/\\'''/g, "\\'");
			}
			ret.push(s);
		});
		return ret.join(" ");
	};
	console.log("[info] shell-escape not installed, using pinned 0.2.0 equivalent");
}

// --------------------------------------------------------------------------
// Module loader stub
//
// sources.js and devices.js pull in couch/redis/rollbar/globals at load time.
// The command builders are pure static functions that touch none of it, so
// everything except node builtins, the sanitizer and shell-escape is replaced
// by a universal do-nothing proxy for the duration of the require.
// --------------------------------------------------------------------------
const STUB = new Proxy(function () { }, {
	get(_t, prop) {
		if (prop === Symbol.toPrimitive) return () => "";
		if (prop === "toString" || prop === "valueOf") return () => "";
		if (prop === "then" || prop === "inspect") return undefined;
		if (typeof prop === "symbol") return undefined;
		return STUB;
	},
	apply() { return STUB; },
	construct() { return STUB; },
	has() { return true; }
});

function requireWithStubs(relative_path) {
	const target = path.join(REPO_ROOT, relative_path);
	const target_resolved = require.resolve(target);
	const originalLoad = Module._load;
	Module._load = function (request, parent, isMain) {
		if (request === target || request === target_resolved) return originalLoad(request, parent, isMain);
		if (request === "shell-escape") return shellEscape;
		if (Module.builtinModules.indexOf(request.replace(/^node:/, "")) !== -1) {
			return originalLoad(request, parent, isMain);
		}
		if (/(^|\/)sanitka(\.js)?$/.test(request)) return originalLoad(request, parent, isMain);
		return STUB;
	};
	try {
		delete require.cache[require.resolve(target)];
		return require(target);
	} finally {
		Module._load = originalLoad;
	}
}

// --------------------------------------------------------------------------
// Tiny test harness
// --------------------------------------------------------------------------
let passed = 0;
const failures = [];

function test(name, fn) {
	try {
		fn();
		passed += 1;
		console.log(`  ok   ${name}`);
	} catch (e) {
		failures.push({ name, error: e });
		console.log(`  FAIL ${name}\n       ${e.message.split("\n").join("\n       ")}`);
	}
}

function section(title) {
	console.log(`\n${title}`);
}

// --------------------------------------------------------------------------
// Payloads that must never survive into a shell word
// --------------------------------------------------------------------------
const METACHARACTER_CASES = [
	["backtick", "`touch A`"],
	["command substitution", "$(touch A)"],
	["semicolon", "; touch A"],
	["pipe", "| touch A"],
	["ampersand", "&& touch A"],
	["newline", "\ntouch A"],
	["space", "x touch A"],
	["single quote", "'; touch A; '"],
	["double quote", "\"; touch A; \""],
	["variable", "$HOME"],
	["redirect", "> A"],
	["glob", "*"]
];

// ==========================================================================
// 1. Sanitka
// ==========================================================================
const Sanitka = require(path.join(REPO_ROOT, "lib/thinx/sanitka.js"));
const sanitka = new Sanitka();

section("Sanitka.branch");

test("undefined -> main", () => assert.strictEqual(sanitka.branch(undefined), "main"));
test("null -> main", () => assert.strictEqual(sanitka.branch(null), "main"));
test("strips leading origin/", () => assert.strictEqual(sanitka.branch("origin/main"), "main"));
test("strips leading origin/ (master)", () => assert.strictEqual(sanitka.branch("origin/master"), "master"));

[
	"main",
	"master",
	"develop",
	"feature/THX-123_new-thing",
	"v1.0.0",
	"release/2026.09"
].forEach((good) => {
	test(`accepts '${good}'`, () => assert.strictEqual(sanitka.branch(good), good));
});

METACHARACTER_CASES.forEach(([label, payload]) => {
	test(`rejects branch with ${label}`, () => {
		assert.strictEqual(sanitka.branch("main" + payload), null, `payload '${payload}' was accepted`);
		assert.strictEqual(sanitka.branch(payload), null, `payload '${payload}' was accepted alone`);
	});
});

[
	["backslash", "main\\x"],
	["brace", "main{x}"],
	["bang", "main!"],
	["tilde", "main~1"],
	["caret", "main^"],
	["colon", "main:x"],
	["question mark", "main?"],
	["bracket", "main[x]"],
	["leading dash (argument injection)", "--upload-pack=touch A"],
	["leading slash", "/main"],
	["leading dot", ".main"],
	["double dot", "feature/../main"],
	["dot-dot", "a..b"],
	["trailing slash", "main/"],
	["trailing dot", "main."],
	["dot lock suffix", "main.lock"],
	["reflog syntax", "main@{1}"],
	["double slash", "a//b"],
	["dot component", "a/.b"],
	["empty string", ""],
	["tab", "main\tx"],
	["carriage return", "main\rx"],
	["non-string", 42],
	["over length cap", "a".repeat(256)]
].forEach(([label, payload]) => {
	test(`rejects branch with ${label}`, () => assert.strictEqual(sanitka.branch(payload), null));
});

test("accepts branch at the length cap", () => {
	const at_cap = "a".repeat(255);
	assert.strictEqual(sanitka.branch(at_cap), at_cap);
});

section("Sanitka.url");

[
	"https://github.com/suculent/thinx-device-api.git",
	"https://github.com/suculent/thinx-firmware-esp8266-pio",
	"http://example.com/repo.git",
	"https://user:token@github.com/suculent/private.git",
	"ssh://git@github.com:22/suculent/thinx-device-api.git",
	"git://example.com/repo.git",
	"git@github.com:suculent/thinx-device-api.git"
].forEach((good) => {
	test(`accepts and returns unchanged '${good}'`, () => assert.strictEqual(sanitka.url(good), good));
});

METACHARACTER_CASES.forEach(([label, payload]) => {
	test(`rejects url with ${label}`, () => {
		assert.strictEqual(sanitka.url("https://github.com/o/r.git" + payload), null, `payload '${payload}' was accepted`);
		assert.strictEqual(sanitka.url("git@github.com:o/r.git" + payload), null, `payload '${payload}' was accepted (scp form)`);
	});
});

[
	["undefined", undefined],
	["null", null],
	["non-string", 42],
	["empty string", ""],
	["no scheme", "github.com/o/r.git"],
	["bare branch name", "origin/master&"],
	["file scheme", "file:///etc/passwd"],
	["ext scheme", "ext::sh -c touch% A"],
	["scheme with backslash", "https:\\\\github.com\\o\\r"],
	["query string", "https://github.com/o/r?x=1"],
	["trailing space", "https://github.com/suculent/thinx-device-api/ && "],
	["embedded newline", "https://github.com/o/r\ntouch A"],
	["over length cap", "https://github.com/" + "a".repeat(2100)]
].forEach(([label, payload]) => {
	test(`rejects url: ${label}`, () => assert.strictEqual(sanitka.url(payload), null));
});

// ==========================================================================
// 2 + 3. Command builders, executed for real
// ==========================================================================
const Sources = requireWithStubs("lib/thinx/sources.js");
const Devices = requireWithStubs("lib/thinx/devices.js");

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-shell-safety-"));
const FAKE_BIN = path.join(SANDBOX, "bin");
fs.mkdirSync(FAKE_BIN);

// Fake git: records argv (unit-separated args, record-separated invocations)
// and, for `clone`, creates a repository directory so the success branch of
// the script is exercised too.
fs.writeFileSync(path.join(FAKE_BIN, "git"), [
	"#!/bin/sh",
	"{",
	"  for a in \"$@\"; do printf '%s\\037' \"$a\"; done",
	"  printf '\\036'",
	"} >> \"$GIT_ARGV_LOG\"",
	"if [ \"$1\" = \"clone\" ]; then",
	"  mkdir -p fakerepo && : > fakerepo/README",
	"fi",
	"exit 0",
	""
].join("\n"), { mode: 0o755 });

let run_counter = 0;

// Runs a built command in a throwaway directory and reports what happened.
function runCommand(build, branch, url) {
	run_counter += 1;
	const case_dir = path.join(SANDBOX, "case-" + run_counter);
	fs.mkdirSync(case_dir);
	const work_dir = path.join(case_dir, "work");
	const argv_log = path.join(case_dir, "git-argv.log");
	fs.writeFileSync(argv_log, "");

	const command = build(work_dir, branch, url);

	try {
		execFileSync("/bin/sh", ["-c", command], {
			cwd: case_dir,
			env: {
				PATH: FAKE_BIN + ":/usr/bin:/bin:/usr/sbin:/sbin",
				GIT_ARGV_LOG: argv_log,
				HOME: case_dir
			},
			stdio: ["ignore", "pipe", "pipe"],
			encoding: "utf8"
		});
	} catch (_e) { /* non-zero exit is fine; we assert on effects */ }

	// one record per git invocation, one unit-separated field per argv entry
	// (the trailing empty field left by the final separator is dropped)
	const invocations = fs.readFileSync(argv_log, "utf8")
		.split("\x1e")
		.filter((record) => record !== "")
		.map((record) => {
			const args = record.split("\x1f");
			args.pop();
			return args;
		});

	return {
		command,
		case_dir,
		work_dir,
		invocations,
		// every path created anywhere in the sandboxed case directory
		tree: listTree(case_dir)
	};
}

function listTree(dir, prefix) {
	prefix = prefix || "";
	let out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? prefix + "/" + entry.name : entry.name;
		out.push(rel);
		if (entry.isDirectory()) out = out.concat(listTree(path.join(dir, entry.name), rel));
	}
	return out;
}

const BUILDERS = [
	["Sources.prefetchCommand", (p, b, u) => Sources.prefetchCommand(p, b, u)],
	["Devices.gitPrefetchCommand", (p, b, u) => Devices.gitPrefetchCommand(p, b, u)]
];

BUILDERS.forEach(([builder_name, build]) => {

	section(builder_name + " (executed through /bin/sh)");

	test("clean input reaches git as clone -b <branch> <url>", () => {
		const r = runCommand(build, "main", "https://github.com/suculent/thinx-firmware-esp8266.git");
		const clone = r.invocations.find((i) => i[0] === "clone");
		assert.ok(clone, "git clone was never invoked:\n" + r.command);
		assert.deepStrictEqual(clone, [
			"clone", "-b", "main", "https://github.com/suculent/thinx-firmware-esp8266.git"
		]);
	});

	METACHARACTER_CASES.forEach(([label, payload]) => {

		test(`branch containing ${label} stays one literal argument`, () => {
			const branch = "main" + payload;
			const r = runCommand(build, branch, "https://github.com/o/r.git");
			const clone = r.invocations.find((i) => i[0] === "clone");
			assert.ok(clone, "git clone was never invoked:\n" + r.command);
			assert.strictEqual(clone.length, 4, "argv was split by the shell: " + JSON.stringify(clone));
			assert.strictEqual(clone[2], branch, "branch was mangled or split: " + JSON.stringify(clone));
			const injected = r.tree.filter((f) => path.basename(f) === "A");
			assert.deepStrictEqual(injected, [], "payload executed, created: " + injected.join(", "));
		});

		test(`url containing ${label} stays one literal argument`, () => {
			const url = "https://github.com/o/r.git" + payload;
			const r = runCommand(build, "main", url);
			const clone = r.invocations.find((i) => i[0] === "clone");
			assert.ok(clone, "git clone was never invoked:\n" + r.command);
			assert.strictEqual(clone.length, 4, "argv was split by the shell: " + JSON.stringify(clone));
			assert.strictEqual(clone[3], url, "url was mangled or split: " + JSON.stringify(clone));
			const injected = r.tree.filter((f) => path.basename(f) === "A");
			assert.deepStrictEqual(injected, [], "payload executed, created: " + injected.join(", "));
		});
	});

	test("target path containing a space and a metacharacter is escaped", () => {
		run_counter += 1;
		const case_dir = path.join(SANDBOX, "path-case-" + run_counter + "-" + builder_name.replace(/\W/g, ""));
		fs.mkdirSync(case_dir);
		const work_dir = path.join(case_dir, "a dir; touch A");
		const argv_log = path.join(case_dir, "git-argv.log");
		fs.writeFileSync(argv_log, "");
		const command = build(work_dir, "main", "https://github.com/o/r.git");
		try {
			execFileSync("/bin/sh", ["-c", command], {
				cwd: case_dir,
				env: { PATH: FAKE_BIN + ":/usr/bin:/bin", GIT_ARGV_LOG: argv_log, HOME: case_dir },
				stdio: ["ignore", "pipe", "pipe"], encoding: "utf8"
			});
		} catch (_e) { /* ignore exit code */ }
		assert.ok(fs.existsSync(work_dir), "escaped path was not created as one directory");
		const injected = listTree(case_dir).filter((f) => path.basename(f) === "A");
		assert.deepStrictEqual(injected, [], "payload in path executed, created: " + injected.join(", "));
	});
});

section("Sources.prefetchCommand observable contract");

test("writes basename.json with basename and branch", () => {
	const r = runCommand(BUILDERS[0][1], "main", "https://github.com/suculent/thinx-firmware-esp8266.git");
	const basename_path = path.join(r.work_dir, "basename.json");
	assert.ok(fs.existsSync(basename_path), "basename.json missing; tree: " + r.tree.join(", ") + "\ncmd: " + r.command);
	const parsed = JSON.parse(fs.readFileSync(basename_path, "utf8"));
	assert.strictEqual(parsed.basename, "fakerepo");
	assert.strictEqual(parsed.branch, "main");
});

test("clones into the requested directory", () => {
	const r = runCommand(BUILDERS[0][1], "main", "https://github.com/o/r.git");
	assert.ok(r.tree.indexOf("work/fakerepo") !== -1, "repo not cloned into the temp path: " + r.tree.join(", "));
});

test("does not run the output of git clone as a command (no `if $(...)`)", () => {
	const command = Sources.prefetchCommand("/tmp/x", "main", "https://github.com/o/r.git");
	assert.strictEqual(/if\s+\$\(/.test(command), false, "command still uses `if $(git clone ...)`: " + command);
	assert.ok(/if\s+git\s+clone/.test(command), "expected a plain `if git clone`: " + command);
});

section("Sanitka + builder end to end");

test("a rejected branch never reaches a command", () => {
	const hostile = "main$(touch A)";
	assert.strictEqual(sanitka.branch(hostile), null);
	assert.strictEqual(sanitka.url("https://github.com/o/r.git" + hostile), null);
});

// --------------------------------------------------------------------------
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_e) { /* best effort */ }

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
	console.log("\nFailures:");
	failures.forEach((f) => console.log(` - ${f.name}: ${f.error.message.split("\n")[0]}`));
	process.exit(1);
}
process.exit(0);
