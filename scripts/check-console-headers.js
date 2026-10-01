#!/usr/bin/env node
/**
 * Console header parity checker (dependency-free). SEC-CSP-04, Phase 25 D-16 / D-19 / D-20.
 *
 * Both console hosts (rtm.thinx.cloud, console.thinx.cloud) serve their edge headers from one
 * gluster nginx file. Its verbatim repository copy is the CANONICAL input; the two console image
 * configs and the post-change nginx -T snapshot must carry the same server-level header set.
 *
 * Inputs (resolved from the repository root):
 *   canonical  .planning/runbooks/swarm-configs/console-default.conf.prod   (gluster copy)
 *   compared   services/console/src/default.conf                           (classic image, __WEB_HOSTNAME__)
 *              services/console/vue/default.conf                           (Vue image, __NGINX_HOST__)
 *              .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx
 *   rtm.thinx.cloud-server.pre.nginx is the historical before-state and is NOT an input (D-20).
 *
 * Rules, applied to EVERY input, canonical included:
 *   - Server-level add_header directives are compared after normalisation: header names
 *     lower-cased; values unquoted with whitespace collapsed; Content-Security-Policy split into
 *     directives (names lower-cased, sources sorted, the __WEB_HOSTNAME__ / __NGINX_HOST__ build
 *     placeholders dropped, directives sorted); Permissions-Policy features compared as a set.
 *     `always` is ignored for equality and reported as a WARN when only one side has it,
 *     except on the CSP: a CSP add_header without `always` fails (CSP-NOT-ALWAYS).
 *   - add_header inside a location (or any nested block) is a failure: nginx then drops every
 *     inherited server-level header, CSP included, on that path.
 *   - A block with proxy_pass whose effective proxy_hide_header set (its own, else inherited, as
 *     nginx resolves it) lacks Content-Security-Policy is a failure: the proxied response would
 *     carry the upstream CSP plus the console CSP (D-19).
 *   - More than one server-level CSP add_header, an empty header value, a file with no
 *     server-level add_header, a missing or unreadable file, or an unparseable file all fail.
 * There is no allowlist or skip flag: drift is fixed in the mirrored files. One exception (25-09):
 * the Vue image config (EVAL_OPTIONAL) may omit 'unsafe-eval' from script-src, because its build
 * asserts that token is absent (vue/tests/security/csp.cjs) while the canonical CSP keeps it for the
 * classic console. Only that token, only in script-src, only in that file.
 *
 * Usage:
 *   node scripts/check-console-headers.js                      # default inputs
 *   node scripts/check-console-headers.js --canonical PATH     # another canonical; the default
 *                                                              # canonical becomes a compared file
 *   node scripts/check-console-headers.js --live PATH          # also compare PATH (a fresh copy of
 *                                                              # the live gluster file); repeatable
 *   const { checkFiles } = require('./scripts/check-console-headers');
 *
 * Output: one line per problem (DRIFT, LOCATION-ADD-HEADER, PROXY-CSP-NOT-HIDDEN, DUPLICATE-CSP, CSP-NOT-ALWAYS,
 * DUPLICATE-HEADER, EMPTY-VALUE, MALFORMED, NO-HEADERS, MISSING, UNPARSEABLE), WARN lines, then
 * `HEADER-PARITY OK files=N` (exit 0) or `HEADER-PARITY FAIL files=N problems=M` (exit 1).
 * Exit 2 on a usage error. Only node built-ins (fs, path) are used.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_INPUTS = [
    ".planning/runbooks/swarm-configs/console-default.conf.prod",
    "services/console/src/default.conf",
    "services/console/vue/default.conf",
    ".planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx"
].map((relative) => path.join(REPO_ROOT, relative));

// The one file allowed to drop 'unsafe-eval' from script-src (see the header comment).
const EVAL_OPTIONAL = [path.join(REPO_ROOT, "services/console/vue/default.conf")];
const UNSAFE_EVAL = "'unsafe-eval'";

const CSP = "content-security-policy";
const PERMISSIONS_POLICY = "permissions-policy";
const PLACEHOLDERS = new Set(["__WEB_HOSTNAME__", "__NGINX_HOST__"]);
const ABSENT = "(absent)";
const NONE = "(none)";

/**
 * Splits nginx config text into statements the way nginx's own reader does: `#` starts a
 * comment only at the start of a token, quotes (with backslash escapes) keep `{ } ; #` literal,
 * and unquoted `{`, `}` and `;` end a statement.
 */
function tokenise(text) {
    const statements = [];
    let words = [];
    let line = 1;
    let firstLine = 0;
    let i = 0;
    const flushWord = (word, wordLine) => {
        if (words.length === 0) firstLine = wordLine;
        words.push(word);
    };
    while (i < text.length) {
        const ch = text[i];
        if (ch === "\n") { line++; i++; continue; }
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === "#") {
            while (i < text.length && text[i] !== "\n") i++;
            continue;
        }
        if (ch === ";" || ch === "{" || ch === "}") {
            statements.push({ words, end: ch, line: words.length ? firstLine : line });
            words = [];
            i++;
            continue;
        }
        // one token: runs of unquoted characters and quoted spans, like a shell word
        const wordLine = line;
        let word = "";
        while (i < text.length) {
            const c = text[i];
            if (c === '"' || c === "'") {
                const quote = c;
                i++;
                let closed = false;
                while (i < text.length) {
                    const q = text[i];
                    if (q === "\\" && i + 1 < text.length) { word += text[i + 1]; if (text[i + 1] === "\n") line++; i += 2; continue; }
                    if (q === quote) { closed = true; i++; break; }
                    if (q === "\n") line++;
                    word += q;
                    i++;
                }
                if (!closed) throw new Error("unterminated quote starting on line " + wordLine);
                continue;
            }
            if (/\s/.test(c) || c === ";" || c === "{" || c === "}") break;
            word += c;
            i++;
        }
        flushWord(word, wordLine);
    }
    if (words.length) throw new Error("unterminated statement on line " + firstLine);
    return statements;
}

/**
 * Parses one console nginx config. Text before the first `server {` line (capture headers in
 * the nginx -T snapshots) is skipped; line numbers still refer to the original text.
 *
 * Returns { headers, locations, problems }:
 *   headers   server-level add_header entries { name, value, always, line }
 *   locations every location block { args, line, directives: [{ name, args, line }] }
 *   problems  structural problems { type, line, detail }
 */
function parse(text) {
    const source = String(text);
    const serverStart = source.search(/^[ \t]*server[ \t]*\{/m);
    let offsetLines = 0;
    let body = source;
    if (serverStart > 0) {
        offsetLines = source.slice(0, serverStart).split("\n").length - 1;
        body = source.slice(serverStart);
    }

    const headers = [];
    const locations = [];
    const problems = [];
    const proxyBlocks = [];

    let statements;
    try {
        statements = tokenise(body);
    } catch (error) {
        problems.push({ type: "UNPARSEABLE", line: 0, detail: error.message });
        return { headers, locations, problems };
    }

    // block nodes: { name, args, line, parent, directives, location }
    const root = { name: "", args: [], line: 0, parent: null, directives: [], location: null };
    let current = root;
    for (const statement of statements) {
        const line = statement.line + offsetLines;
        if (statement.end === "}") {
            if (statement.words.length) {
                problems.push({ type: "UNPARSEABLE", line, detail: "directive without ';' before '}'" });
            }
            if (current === root) {
                problems.push({ type: "UNPARSEABLE", line, detail: "unbalanced '}'" });
                continue;
            }
            current = current.parent;
            continue;
        }
        const [name = "", ...args] = statement.words;
        if (statement.end === "{") {
            const block = { name, args, line, parent: current, directives: [], location: null };
            if (name === "location") {
                block.location = { args, line, directives: block.directives };
                locations.push(block.location);
            } else {
                block.location = current.location;
            }
            current.directives.push({ name, args, line, block });
            current = block;
            continue;
        }
        if (!name) continue; // stray ';'
        current.directives.push({ name, args, line });

        if (name === "add_header") {
            if (current.name !== "server") {
                const where = current.name ? [current.name].concat(current.args).join(" ") : "outside any server block";
                problems.push({ type: "LOCATION-ADD-HEADER", line, detail: where });
                continue;
            }
            if (args.length < 2 || args[1].trim() === "") {
                problems.push({ type: "EMPTY-VALUE", line, detail: args[0] || "" });
                continue;
            }
            if (args.length > 3 || (args.length === 3 && args[2] !== "always")) {
                problems.push({ type: "MALFORMED", line, detail: "add_header " + args.join(" ") });
                continue;
            }
            if ((String(args[0]).toLowerCase() === CSP) && (args.length !== 3)) {
                // 25-REVIEW WR-01: proxy locations hide the upstream CSP (D-19), so without
                // `always` a proxied 4xx/5xx response would carry no CSP at all.
                problems.push({ type: "CSP-NOT-ALWAYS", line, detail: "add_header " + args[0] });
            }
            headers.push({ name: args[0], value: args[1], always: args.length === 3, line });
        } else if (name === "proxy_pass") {
            proxyBlocks.push({ block: current, line });
        }
    }
    if (current !== root) {
        problems.push({ type: "UNPARSEABLE", line: current.line, detail: "unclosed '" + current.name + "' block" });
    }

    // D-19: nginx inherits proxy_hide_header from the enclosing level only when the current level
    // sets none of its own, exactly like add_header.
    const hidesCsp = (block) => {
        for (let b = block; b; b = b.parent) {
            const own = b.directives.filter((d) => d.name === "proxy_hide_header");
            if (own.length) return own.some((d) => (d.args[0] || "").toLowerCase() === CSP);
        }
        return false;
    };
    for (const { block, line } of proxyBlocks) {
        if (!hidesCsp(block)) {
            const where = block.location ? "location " + block.location.args.join(" ") + " (line " + block.location.line + ")" : (block.name || "top level") + " (line " + line + ")";
            problems.push({ type: "PROXY-CSP-NOT-HIDDEN", line, detail: where });
        }
    }

    const csps = headers.filter((h) => h.name.toLowerCase() === CSP);
    if (csps.length > 1) {
        problems.push({ type: "DUPLICATE-CSP", line: csps[1].line, detail: "lines " + csps.map((h) => h.line).join(",") });
    }
    const seen = new Map();
    for (const header of headers) {
        const key = header.name.toLowerCase();
        if (key === CSP) continue;
        if (seen.has(key)) {
            problems.push({ type: "DUPLICATE-HEADER", line: header.line, detail: key + " lines " + seen.get(key) + "," + header.line });
        } else {
            seen.set(key, header.line);
        }
    }

    return { headers, locations, problems };
}

function collapse(value) {
    return String(value).replace(/\s+/g, " ").trim();
}

// CSP as a sorted list of [directive, sorted sources]; placeholders dropped.
function cspDirectives(value) {
    return String(value).split(";")
        .map((part) => collapse(part))
        .filter(Boolean)
        .map((part) => {
            const [directive, ...sources] = part.split(" ");
            return [directive.toLowerCase(), sources.filter((s) => !PLACEHOLDERS.has(s)).sort()];
        })
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function permissionsFeatures(value) {
    return String(value).split(",").map((part) => collapse(part)).filter(Boolean).sort();
}

/**
 * Normalises server-level headers into { lower-cased name: { value, always, line } }.
 * The first occurrence of a name wins; duplicates are reported by parse().
 */
function normalise(headers) {
    const out = {};
    for (const header of headers || []) {
        const name = String(header.name).toLowerCase();
        if (Object.prototype.hasOwnProperty.call(out, name)) continue;
        let value;
        if (name === CSP) {
            value = cspDirectives(header.value).map(([d, s]) => [d].concat(s).join(" ")).join("; ");
        } else if (name === PERMISSIONS_POLICY) {
            value = permissionsFeatures(header.value).join(", ");
        } else {
            value = collapse(header.value);
        }
        out[name] = { value, always: Boolean(header.always), line: header.line };
    }
    return out;
}

// For a differing CSP, only the directive/source parts each side has that the other lacks.
function cspDifference(canonicalValue, otherValue) {
    const a = new Map(cspDirectives(canonicalValue));
    const b = new Map(cspDirectives(otherValue));
    const side = (from, to) => {
        const parts = [];
        for (const [directive, sources] of from) {
            if (!to.has(directive)) {
                parts.push([directive].concat(sources).join(" "));
                continue;
            }
            const others = to.get(directive);
            const only = sources.filter((s) => !others.includes(s));
            if (only.length) parts.push([directive].concat(only).join(" "));
        }
        return parts.join("; ") || NONE;
    };
    return { canonical: side(a, b), other: side(b, a) };
}

/**
 * Compares two normalise() results.
 * Returns { drift: [{ header, canonical, other }], warnings: [{ header, canonical, other }] }.
 */
function compare(canonical, other, options) {
    if (options && options.evalOptional) canonical = withoutOmittedEval(canonical, other);
    const drift = [];
    const warnings = [];
    const names = Array.from(new Set(Object.keys(canonical || {}).concat(Object.keys(other || {})))).sort();
    for (const name of names) {
        const a = canonical[name];
        const b = other[name];
        if (!a || !b) {
            drift.push({ header: name, canonical: a ? a.value : ABSENT, other: b ? b.value : ABSENT });
            continue;
        }
        if (a.value !== b.value) {
            if (name === CSP) {
                const diff = cspDifference(a.value, b.value);
                drift.push({ header: name, canonical: diff.canonical, other: diff.other });
            } else {
                drift.push({ header: name, canonical: a.value, other: b.value });
            }
        }
        if (a.always !== b.always) {
            warnings.push({ header: name, canonical: a.always ? "always" : "no-always", other: b.always ? "always" : "no-always" });
        }
    }
    return { drift, warnings };
}

// The canonical headers with 'unsafe-eval' dropped from script-src when the other side's
// script-src lacks it; unchanged otherwise.
function withoutOmittedEval(canonical, other) {
    const a = canonical && canonical[CSP];
    const b = other && other[CSP];
    if (!a || !b) return canonical;
    const theirs = new Map(cspDirectives(b.value));
    if (!theirs.has("script-src") || theirs.get("script-src").includes(UNSAFE_EVAL)) return canonical;
    const value = cspDirectives(a.value)
        .map(([d, sources]) => [d].concat(d === "script-src" ? sources.filter((x) => x !== UNSAFE_EVAL) : sources).join(" "))
        .join("; ");
    return Object.assign({}, canonical, { [CSP]: Object.assign({}, a, { value }) });
}

function display(file) {
    const relative = path.relative(REPO_ROOT, file);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}

function formatProblem(file, problem) {
    switch (problem.type) {
        case "PROXY-CSP-NOT-HIDDEN":
            return "PROXY-CSP-NOT-HIDDEN " + file + " " + problem.detail;
        case "DUPLICATE-CSP":
            return "DUPLICATE-CSP " + file + " " + problem.detail;
        case "DUPLICATE-HEADER":
            return "DUPLICATE-HEADER " + file + " " + problem.detail;
        case "EMPTY-VALUE":
            return "EMPTY-VALUE " + file + ":" + problem.line;
        case "UNPARSEABLE":
            return "UNPARSEABLE " + file + ":" + problem.line + " " + problem.detail;
        default:
            return problem.type + " " + file + ":" + problem.line + " " + problem.detail;
    }
}

function load(file, label, problems) {
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    } catch (_error) {
        // missing and unreadable are the same failure: the input cannot be checked
        problems.push("MISSING " + label);
        return null;
    }
    const parsed = parse(text);
    for (const problem of parsed.problems) problems.push(formatProblem(label, problem));
    if (parsed.headers.length === 0) problems.push("NO-HEADERS " + label);
    return parsed;
}

/**
 * Checks the canonical file and every compared file.
 * Returns { ok, files, problems: [line], warnings: [line] }.
 */
function checkFiles(canonicalPath, otherPaths, options) {
    const evalOptional = new Set(((options && options.evalOptional) || EVAL_OPTIONAL).map((p) => path.resolve(p)));
    const problems = [];
    const warnings = [];
    const others = otherPaths || [];
    const canonicalLabel = display(canonicalPath);
    const canonical = load(canonicalPath, canonicalLabel, problems);
    const canonicalHeaders = canonical && canonical.headers.length ? normalise(canonical.headers) : null;

    for (const file of others) {
        const label = display(file);
        const parsed = load(file, label, problems);
        if (!parsed || !canonicalHeaders || parsed.headers.length === 0) continue;
        const result = compare(canonicalHeaders, normalise(parsed.headers), { evalOptional: evalOptional.has(path.resolve(file)) });
        for (const d of result.drift) {
            problems.push("DRIFT " + label + " " + d.header + ": canonical=" + d.canonical + " other=" + d.other);
        }
        for (const w of result.warnings) {
            warnings.push("WARN always " + label + " " + w.header + ": canonical=" + w.canonical + " other=" + w.other);
        }
    }
    return { ok: problems.length === 0, files: 1 + others.length, problems, warnings };
}

/**
 * CLI arguments: --canonical PATH (replaces the canonical; the default canonical then becomes a
 * compared file), --live PATH (adds a compared file; repeatable). Anything else is an error.
 */
function parseArgs(argv) {
    let canonical = DEFAULT_INPUTS[0];
    const live = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        let flag = arg;
        let value;
        const eq = arg.indexOf("=");
        if (arg.startsWith("--") && eq !== -1) {
            flag = arg.slice(0, eq);
            value = arg.slice(eq + 1);
        }
        if (flag !== "--canonical" && flag !== "--live") throw new Error("unknown argument: " + arg);
        if (value === undefined) {
            value = argv[++i];
            if (value === undefined || value.startsWith("--")) throw new Error(flag + " requires a path");
        }
        if (!value) throw new Error(flag + " requires a path");
        if (flag === "--canonical") canonical = path.resolve(value);
        else live.push(path.resolve(value));
    }
    const others = DEFAULT_INPUTS.filter((file) => file !== canonical).concat(live);
    return { canonical, others };
}

function main(argv) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (error) {
        console.error("check-console-headers: " + error.message);
        console.error("usage: node scripts/check-console-headers.js [--canonical PATH] [--live PATH]...");
        return 2;
    }
    const report = checkFiles(args.canonical, args.others);
    for (const line of report.problems) console.log(line);
    for (const line of report.warnings) console.log(line);
    if (report.ok) {
        console.log("HEADER-PARITY OK files=" + report.files);
        return 0;
    }
    console.log("HEADER-PARITY FAIL files=" + report.files + " problems=" + report.problems.length);
    return 1;
}

module.exports = { parse, normalise, compare, checkFiles, parseArgs, DEFAULT_INPUTS, EVAL_OPTIONAL };

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}
