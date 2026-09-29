// SEC-CSP-04 / Phase 25 D-16, D-19, D-20: unit cases for scripts/check-console-headers.js.
// Fixtures are inline strings (written to a temp dir where checkFiles needs paths), never the
// real console configs, so these cases hold before and after plan 25-09 hardens them.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parse, normalise, compare, checkFiles, parseArgs, DEFAULT_INPUTS } = require(path.join(__dirname, "../../scripts/check-console-headers.js"));

const CSP = "default-src 'self' https://a.example https://b.example data:; script-src 'self' https://a.example 'unsafe-eval'; object-src 'none'";

function server(body) {
    return "server {\n    listen 80;\n" + body + "\n    location / {\n        root /usr/share/nginx/html;\n    }\n}\n";
}

function headersOf(text) {
    return normalise(parse(text).headers);
}

let tmpRoot;
function tmpFile(name, text) {
    if (!tmpRoot) tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "console-header-parity-"));
    const file = path.join(tmpRoot, name);
    fs.writeFileSync(file, text);
    return file;
}

test.after(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const BASE = server([
    '    add_header "X-Frame-Options" "DENY";',
    '    add_header "Content-Security-Policy" "' + CSP + '" always;'
].join("\n"));

test("CSP directive order, source order, header-name case, quote style and whitespace compare equal", () => {
    const alt = server([
        "    add_header x-frame-options   'DENY' ;",
        "    add_header CONTENT-SECURITY-POLICY  \"object-src  'none'; SCRIPT-SRC 'unsafe-eval' https://a.example 'self';;  default-src data:   https://b.example 'self'\thttps://a.example \"   always;"
    ].join("\n"));
    assert.deepEqual(Object.keys(headersOf(alt)).sort(), ["content-security-policy", "x-frame-options"]);
    const result = compare(headersOf(BASE), headersOf(alt));
    assert.deepEqual(result.drift, []);
    assert.deepEqual(result.warnings, []);
    // control: a real source difference in the same shape is still drift
    const changed = alt.replace("https://b.example", "https://c.example");
    assert.equal(compare(headersOf(BASE), headersOf(changed)).drift.length, 1);
});

test("`always` present on one side only is a WARN, not a failure", () => {
    const noAlways = BASE.replace(/" always;/, '";');
    const result = compare(headersOf(BASE), headersOf(noAlways));
    assert.deepEqual(result.drift, []);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].header, "content-security-policy");

    const canonical = tmpFile("always-canonical.conf", BASE);
    const other = tmpFile("always-other.conf", noAlways);
    const report = checkFiles(canonical, [other]);
    assert.equal(report.ok, true, report.problems.join("\n"));
    assert.ok(report.warnings.some((line) => /^WARN always .*always-other\.conf content-security-policy/.test(line)), report.warnings.join("\n"));
});

test("__WEB_HOSTNAME__ / __NGINX_HOST__ placeholder sources are dropped before comparison", () => {
    const web = BASE.replace("default-src 'self'", "default-src 'self' __WEB_HOSTNAME__").replace("script-src 'self'", "script-src __WEB_HOSTNAME__ 'self'");
    const vue = BASE.replace("default-src 'self'", "default-src __NGINX_HOST__ 'self'");
    assert.deepEqual(compare(headersOf(BASE), headersOf(web)).drift, []);
    assert.deepEqual(compare(headersOf(BASE), headersOf(vue)).drift, []);
    assert.doesNotMatch(headersOf(web)["content-security-policy"].value, /__WEB_HOSTNAME__/);
});

test("Permissions-Policy features compare as a set", () => {
    const a = server('    add_header "Permissions-Policy" "camera=(), microphone=(), geolocation=()" always;');
    const b = server('    add_header "Permissions-Policy" "geolocation=(),camera=(),   microphone=()" always;');
    const c = server('    add_header "Permissions-Policy" "camera=(), microphone=()" always;');
    assert.deepEqual(compare(headersOf(a), headersOf(b)).drift, []);
    const drift = compare(headersOf(a), headersOf(c)).drift;
    assert.equal(drift.length, 1);
    assert.equal(drift[0].header, "permissions-policy");
});

test("add_header inside a location is LOCATION-ADD-HEADER naming file and line", () => {
    const text = [
        "server {",
        '    add_header "X-Frame-Options" "DENY";',
        '    location ~* "^/[0-9a-f]{64}(/[^/]+)?$" {',
        "        proxy_pass http://$endpoint:7442;",
        "        proxy_hide_header Content-Security-Policy;",
        "    }",
        "    location / {",
        '        add_header "Cache-Control" "no-store";',
        "    }",
        "}"
    ].join("\n");
    const parsed = parse(text);
    assert.equal(parsed.headers.length, 1, "the location add_header is not a server-level header");
    const file = tmpFile("location-add-header.conf", text);
    const report = checkFiles(file, []);
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((line) => line.startsWith("LOCATION-ADD-HEADER " + file + ":8")), report.problems.join("\n"));
});

test("a proxy_pass location without proxy_hide_header Content-Security-Policy is PROXY-CSP-NOT-HIDDEN", () => {
    const unhidden = server([
        '    add_header "X-Frame-Options" "DENY";',
        "    location ~* ^/api/ {",
        "        proxy_pass http://$endpoint:7442;",
        "    }"
    ].join("\n"));
    const hidden = unhidden.replace("proxy_pass http://$endpoint:7442;", "proxy_pass http://$endpoint:7442;\n        proxy_hide_header content-security-policy;");
    const serverLevel = unhidden.replace("    listen 80;", "    listen 80;\n    proxy_hide_header Content-Security-Policy;");
    const overridden = serverLevel.replace("proxy_pass http://$endpoint:7442;", "proxy_pass http://$endpoint:7442;\n        proxy_hide_header X-Powered-By;");

    const bad = checkFiles(tmpFile("proxy-unhidden.conf", unhidden), []);
    assert.equal(bad.ok, false);
    assert.ok(bad.problems.some((line) => /^PROXY-CSP-NOT-HIDDEN .*proxy-unhidden\.conf location ~\* \^\/api\//.test(line)), bad.problems.join("\n"));

    assert.deepEqual(checkFiles(tmpFile("proxy-hidden.conf", hidden), []).problems, []);
    // nginx inherits proxy_hide_header from the server level unless the location sets its own
    assert.deepEqual(checkFiles(tmpFile("proxy-server-level.conf", serverLevel), []).problems, []);
    assert.ok(checkFiles(tmpFile("proxy-overridden.conf", overridden), []).problems.some((line) => line.startsWith("PROXY-CSP-NOT-HIDDEN")));
});

test("a second server-level CSP add_header is DUPLICATE-CSP", () => {
    const text = BASE.replace('    add_header "X-Frame-Options" "DENY";', '    add_header "X-Frame-Options" "DENY";\n    add_header "content-security-policy" "default-src \'self\'";');
    const report = checkFiles(tmpFile("duplicate-csp.conf", text), []);
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((line) => /^DUPLICATE-CSP .*duplicate-csp\.conf/.test(line)), report.problems.join("\n"));
});

test("an empty header value is EMPTY-VALUE, never a pass", () => {
    const file = tmpFile("empty-value.conf", server('    add_header "X-Frame-Options" "DENY";\n    add_header "Referrer-Policy" "  ";'));
    const report = checkFiles(file, []);
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((line) => line === "EMPTY-VALUE " + file + ":4"), report.problems.join("\n"));
    const missingValue = tmpFile("missing-value.conf", server('    add_header "X-Frame-Options" "DENY";\n    add_header "Referrer-Policy";'));
    assert.ok(checkFiles(missingValue, []).problems.some((line) => line.startsWith("EMPTY-VALUE " + missingValue)));
});

test("a file with zero server-level add_header is NO-HEADERS, never a pass", () => {
    const empty = tmpFile("no-headers.conf", server(""));
    const commentsOnly = tmpFile("comments-only.conf", "# nothing here\n# add_header \"X-Frame-Options\" \"DENY\";\n");
    const canonical = tmpFile("no-headers-canonical.conf", BASE);
    const report = checkFiles(canonical, [empty, commentsOnly]);
    assert.equal(report.ok, false);
    assert.ok(report.problems.includes("NO-HEADERS " + empty), report.problems.join("\n"));
    assert.ok(report.problems.includes("NO-HEADERS " + commentsOnly), report.problems.join("\n"));
    assert.equal(checkFiles(empty, []).ok, false, "an empty canonical fails too");
});

test("a missing input path is MISSING, canonical or compared", () => {
    const canonical = tmpFile("missing-canonical.conf", BASE);
    const absent = path.join(path.dirname(canonical), "does-not-exist.conf");
    const report = checkFiles(canonical, [absent]);
    assert.equal(report.ok, false);
    assert.ok(report.problems.includes("MISSING " + absent), report.problems.join("\n"));
    const noCanonical = checkFiles(absent, [canonical]);
    assert.equal(noCanonical.ok, false);
    assert.ok(noCanonical.problems.includes("MISSING " + absent));
});

test("a header missing, extra or different in a compared file is a DRIFT line naming file and header", () => {
    const canonical = tmpFile("drift-canonical.conf", BASE.replace('    add_header "X-Frame-Options" "DENY";', '    add_header "X-Frame-Options" "DENY";\n    add_header "X-Permitted-Cross-Domain-Policies" "all";'));
    const missing = tmpFile("drift-missing.conf", BASE);
    const extra = tmpFile("drift-extra.conf", BASE.replace('    add_header "X-Frame-Options" "DENY";', '    add_header "X-Frame-Options" "DENY";\n    add_header "X-Permitted-Cross-Domain-Policies" "all";\n    add_header "Referrer-Policy" "no-referrer" always;'));
    const different = tmpFile("drift-different.conf", BASE.replace('    add_header "X-Frame-Options" "DENY";', '    add_header "X-Frame-Options" "DENY";\n    add_header "X-Permitted-Cross-Domain-Policies" "none";').replace("https://b.example ", ""));
    const report = checkFiles(canonical, [missing, extra, different]);
    assert.equal(report.ok, false);
    const has = (re) => assert.ok(report.problems.some((line) => re.test(line)), re + "\n" + report.problems.join("\n"));
    has(/^DRIFT .*drift-missing\.conf x-permitted-cross-domain-policies: canonical=all other=\(absent\)$/);
    has(/^DRIFT .*drift-extra\.conf referrer-policy: canonical=\(absent\) other=no-referrer$/);
    has(/^DRIFT .*drift-different\.conf x-permitted-cross-domain-policies: canonical=all other=none$/);
    has(/^DRIFT .*drift-different\.conf content-security-policy: canonical=default-src https:\/\/b\.example other=\(none\)$/);
    assert.equal(report.problems.filter((line) => line.startsWith("DRIFT")).length, 4, report.problems.join("\n"));
});

test("comment lines before the server block and quoted braces in a location regex parse cleanly", () => {
    const text = "# Captured: somewhere\n# configuration file /etc/nginx/conf.d/default.conf:\n" + BASE.replace(
        "    location / {",
        '    location ~* "^/[0-9a-f]{64}(/[^/]+)?$" {\n        proxy_pass http://$endpoint:7442; # upstream\n        proxy_hide_header Content-Security-Policy;\n    }\n    location / {'
    );
    const parsed = parse(text);
    assert.deepEqual(parsed.problems, []);
    assert.equal(parsed.headers.length, 2);
    assert.equal(parsed.headers[1].line, 6);
    assert.equal(parsed.locations.length, 2);
    assert.equal(parsed.locations[0].args.join(" "), "~* ^/[0-9a-f]{64}(/[^/]+)?$");
});

test("identical files pass with HEADER-PARITY OK semantics and the CLI defaults follow D-20", () => {
    const report = checkFiles(tmpFile("same-a.conf", BASE), [tmpFile("same-b.conf", BASE.replace('"DENY"', "'DENY'"))]);
    assert.equal(report.ok, true, report.problems.join("\n"));
    assert.equal(report.files, 2);

    const names = DEFAULT_INPUTS.map((p) => path.basename(p));
    assert.deepEqual(names, ["console-default.conf.prod", "default.conf", "default.conf", "rtm.thinx.cloud-server.post.nginx"]);
    assert.ok(!names.some((n) => /\.pre\.nginx$/.test(n)), "pre.nginx is not a parity input");

    const plain = parseArgs([]);
    assert.equal(plain.canonical, DEFAULT_INPUTS[0]);
    assert.deepEqual(plain.others, DEFAULT_INPUTS.slice(1));
    const live = parseArgs(["--live", "/tmp/gluster.conf"]);
    assert.deepEqual(live.others, DEFAULT_INPUTS.slice(1).concat([path.resolve("/tmp/gluster.conf")]));
    const swapped = parseArgs(["--canonical", "/tmp/new.conf"]);
    assert.equal(swapped.canonical, path.resolve("/tmp/new.conf"));
    assert.deepEqual(swapped.others, DEFAULT_INPUTS);
    assert.throws(() => parseArgs(["--skip", "x"]), /unknown argument/);
    assert.throws(() => parseArgs(["--live"]), /requires a path/);
});
