// D-15 static guard: no audit writer under lib/ may pass anything but literal
// string flags to alog.log, and the password-reset path must not dump the user
// document or the changes (new password hash) into the API log.
//
// Reads source text with fs only; requires no lib module, so it needs no
// helpers, no CouchDB and no Redis. Violations are reported as file:line,
// never with argument text.

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, "../../lib");
const CALL = "alog.log(";

function listJs(dir) {
  let out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      out = out.concat(listJs(p));
    } else if (ent.isFile() && ent.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

// Index just past the string literal that starts at i (quote at src[i]).
function skipString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") { j += 2; continue; }
    if (ch === q) return j + 1;
    // A quote string cannot span lines; stopping at the newline keeps a
    // quote inside a regex literal from desynchronising more than one line.
    if (ch === "\n" && q !== "`") return j;
    j += 1;
  }
  return j;
}

// Index just past a comment starting at i, or i when there is none.
function skipComment(src, i) {
  if (src[i] !== "/") return i;
  if (src[i + 1] === "/") {
    const e = src.indexOf("\n", i);
    return e === -1 ? src.length : e;
  }
  if (src[i + 1] === "*") {
    const e = src.indexOf("*/", i + 2);
    return e === -1 ? src.length : e + 2;
  }
  return i;
}

// Split the text between an opening bracket at `open` and its match into
// top-level comma-separated parts. Returns { parts, end } with end just past
// the closing bracket.
function splitBalanced(src, open) {
  const closeFor = { "(": ")", "[": "]", "{": "}" };
  const stack = [closeFor[src[open]]];
  const parts = [];
  let start = open + 1;
  let i = open + 1;
  while (i < src.length && stack.length > 0) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`") { i = skipString(src, i); continue; }
    const c = skipComment(src, i);
    if (c !== i) { i = c; continue; }
    if (closeFor[ch]) { stack.push(closeFor[ch]); i += 1; continue; }
    if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) { parts.push(src.slice(start, i)); return { parts, end: i + 1 }; }
      i += 1;
      continue;
    }
    if (ch === "," && stack.length === 1) { parts.push(src.slice(start, i)); start = i + 1; }
    i += 1;
  }
  return { parts, end: src.length };
}

const STRING_LITERAL = /^(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")$/;

function isStringLiteral(text) {
  return STRING_LITERAL.test(text.trim());
}

function isStringArrayLiteral(text) {
  const t = text.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return false;
  const { parts, end } = splitBalanced(t, 0);
  if (end !== t.length) return false;
  const items = parts.map((p) => p.trim());
  // Allow [] and a trailing comma.
  if (items.length === 1 && items[0] === "") return true;
  if (items.length > 1 && items[items.length - 1] === "") items.pop();
  return items.every(isStringLiteral);
}

// `<condition> ? "a" : "b"` — both branches literal (lib/thinx/owner_purge.js).
function isLiteralConditional(text) {
  const m = /\?\s*((?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"))\s*:\s*((?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"))\s*$/.exec(text.trim());
  return !!m;
}

function isLiteralFlag(text) {
  return isStringLiteral(text) || isStringArrayLiteral(text) || isLiteralConditional(text);
}

// Every alog.log( call outside strings and comments, with its 1-based line
// and its top-level argument texts.
function findCalls(src) {
  const calls = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`") { i = skipString(src, i); continue; }
    const c = skipComment(src, i);
    if (c !== i) { i = c; continue; }
    if (src.startsWith(CALL, i) && (i === 0 || !/[A-Za-z0-9_$]/.test(src[i - 1]))) {
      const line = src.slice(0, i).split("\n").length;
      const open = i + CALL.length - 1;
      const { parts, end } = splitBalanced(src, open);
      const args = parts.map((p) => p.trim());
      if (args.length === 1 && args[0] === "") args.pop();
      const endLine = line + (src.slice(i, end).split("\n").length - 1);
      calls.push({ line, endLine, args });
      i = end;
      continue;
    }
    i += 1;
  }
  return calls;
}

function violations(src, label) {
  const out = [];
  for (const call of findCalls(src)) {
    if (call.args.length >= 3 && !isLiteralFlag(call.args[2])) out.push(label + ":" + call.line);
  }
  return out;
}

// Body of `name(...) {...}` as declared in a class (first declaration).
function methodBody(src, name) {
  const decl = new RegExp("\\n\\s*(?:async\\s+)?" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = decl.exec(src);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const { end } = splitBalanced(src, open);
  return src.slice(open, end);
}

describe("D-15 audit flag writers (static guard)", function () {

  it("the scanner is not vacuous: an object flag is a violation, literal flags are not", function () {
    expect(violations('alog.log(o, "m", someObject);', "inline")).to.deep.equal(["inline:1"]);
    expect(violations('alog.log(o, "m", ["admin", "x"]);', "inline")).to.deep.equal([]);
    expect(violations("alog.log(o, 'm', 'warning');", "inline")).to.deep.equal([]);
    expect(violations('alog.log(o, "m");', "inline")).to.deep.equal([]);
    expect(violations('this.alog.log(o, "m", ok ? "info" : "error");', "inline")).to.deep.equal([]);
    expect(violations('this.alog.log(o, "m", ok ? "info" : changes);', "inline")).to.deep.equal(["inline:1"]);
    expect(violations('x();\nalog.log(\n  o,\n  "m (" + a + ")",\n  ["admin", abody]\n);', "inline")).to.deep.equal(["inline:2"]);
    expect(violations('// alog.log(o, "m", abody)\nconst s = "alog.log(o, m, abody)";', "inline")).to.deep.equal([]);
  });

  it("finds the alog.log call sites under lib/ (multi-line calls included)", function () {
    let total = 0;
    let multiLine = 0;
    for (const file of listJs(LIB)) {
      for (const call of findCalls(fs.readFileSync(file, "utf8"))) {
        total += 1;
        if (call.endLine > call.line) multiLine += 1;
      }
    }
    expect(total).to.be.greaterThan(40);
    expect(multiLine).to.be.greaterThan(0);
  });

  it("no alog.log call under lib/ passes a non-literal third argument", function () {
    let found = [];
    for (const file of listJs(LIB)) {
      const label = path.relative(path.join(__dirname, "../.."), file);
      found = found.concat(violations(fs.readFileSync(file, "utf8"), label));
    }
    expect(found).to.deep.equal([]);
  });

  it("owner.js apply_update and sources.js updateUser log the string flag \"info\"", function () {
    const owner = fs.readFileSync(path.join(LIB, "thinx/owner.js"), "utf8");
    const sources = fs.readFileSync(path.join(LIB, "thinx/sources.js"), "utf8");
    expect(owner).to.contain('"Profile updated successfully.", "info"');
    expect(sources).to.contain('"Atomic tag updated successfully.", "info"');
  });

  it("set_password_reset does not serialise the user document or the changes into the API log", function () {
    const owner = fs.readFileSync(path.join(LIB, "thinx/owner.js"), "utf8");
    const body = methodBody(owner, "set_password_reset");
    expect(body, "set_password_reset not found").to.be.a("string");
    expect(body).to.contain("this.atomic(userdoc._id, changes");
    expect(/JSON\.stringify\(\s*(userdoc|changes)\b/.test(body)).to.equal(false);
    const consoleLines = body.split("\n").filter((l) => /console\.\w+\(/.test(l));
    for (const l of consoleLines) {
      expect(/\b(userdoc|changes)\b/.test(l), "console line references userdoc/changes").to.equal(false);
    }
  });
});
