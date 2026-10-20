const logSafe = require("../../lib/thinx/logsafe");
const Util = require("../../lib/thinx/util");

describe("logSafe (log-injection guard)", function () {

	it("keeps a plain value unchanged", function () {
		expect(logSafe("udid 1234-abcd")).toBe("udid 1234-abcd");
	});

	it("removes CR, LF and CRLF so a value cannot forge a second log line", function () {
		expect(logSafe("a\nINFO fake\r\nb\rc")).toBe("aINFO fakebc");
	});

	it("replaces other control characters and Unicode line separators", function () {
		expect(logSafe("a\u0000b\u001bc\u007fd\u2028e\u2029f")).toBe("a?b?c?d?e?f");
	});

	it("keeps tab", function () {
		expect(logSafe("a\tb")).toBe("a\tb");
	});

	it("renders null, undefined, numbers, objects and errors on one line", function () {
		expect(logSafe(undefined)).toBe("undefined");
		expect(logSafe(null)).toBe("null");
		expect(logSafe(42)).toBe("42");
		expect(logSafe({ a: "x\ny" })).not.toMatch(/[\r\n]/);
		expect(logSafe(new Error("bad\nthing"))).toBe("Error: badthing");
	});

	it("never throws on a circular object", function () {
		const o = {}; o.self = o;
		expect(logSafe(o)).toBe("[object Object]");
	});

	it("cuts long values", function () {
		expect(logSafe("x".repeat(500)).length).toBe(201);
		expect(logSafe("abcdef", 3)).toBe("abc…");
	});

	it("redactors never return a line break", function () {
		expect(Util.redactToken("ab\ncdefgh")).not.toMatch(/[\r\n]/);
		expect(Util.redactEmail("a\n@b.c\nd")).not.toMatch(/[\r\n]/);
	});
});
