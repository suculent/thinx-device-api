/*
 * CsrfRouteInventorySpec — SEC-CSRF-04 / SEC-CSRF-05 guarded-route inventory.
 *
 * Static, local, no services: reads the router sources as text. It does NOT boot
 * the app (no bootstrap, no CouchDB, no Redis), so it runs anywhere.
 *
 * GUARDED rows must be registered with `csrf.verifyCsrfToken` on the same source
 * line as `app.{method}(` and the quoted path. NOT_GUARDED rows are the recorded
 * exclusions (D-11 inventory record), each with its reason; they must NOT carry
 * the middleware. A row whose registration line cannot be found fails with the
 * row in the message, so a renamed or moved route cannot drop out silently.
 *
 * Plan 25-07 added the remaining D-11 account routes (credentials, GitHub token
 * link, admin mutations, device-ownership transfer POSTs) and their exclusions.
 * Quick 261003-skk added the lib/router.mesh.js rows: the four mesh mutations are
 * guarded (D-21 lifted for that file only) and the three mesh list reads are
 * recorded exclusions.
 * The runbook's "Phase 25 guarded-route inventory" mirrors these tables.
 */

const fs = require("fs");
const path = require("path");

const LIB = path.join(__dirname, "..", "..", "lib");
const FACTORY = 'require("./middleware/csrf")(app)';
const GUARD = "csrf.verifyCsrfToken";

// [file, method, path]
const GUARDED = [
    // SEC-CSRF-01 (v1.13) guards
    ["router.auth.js", "post", "/api/login"],
    ["router.auth.js", "post", "/api/v2/login"],
    ["router.auth.js", "post", "/api/v2/session/token"],
    ["router.user.js", "post", "/api/v2/password/reset"],
    ["router.user.js", "post", "/api/v2/password/set"],
    ["router.user.js", "post", "/api/user/create"],
    ["router.user.js", "post", "/api/user/password/set"],
    ["router.user.js", "post", "/api/user/password/reset"],
    // SEC-CSRF-04 / WR-04: registration, no machine-client exemption (decision 2026-09-25)
    ["router.user.js", "post", "/api/v2/user"],
    // SEC-CSRF-05 account mutations and their same-handler twins (D-10, D-11)
    ["router.user.js", "delete", "/api/v2/user"],
    ["router.user.js", "post", "/api/user/delete"],
    ["router.profile.js", "post", "/api/v2/profile"],
    ["router.profile.js", "post", "/api/user/profile"],
    ["router.gdpr.js", "delete", "/api/v2/gdpr"],
    ["router.gdpr.js", "post", "/api/gdpr/revoke"],
    // D-11 credential mutations: API keys, deploy keys, environment secrets
    ["router.apikey.js", "post", "/api/user/apikey"],
    ["router.apikey.js", "post", "/api/user/apikey/revoke"],
    ["router.apikey.js", "post", "/api/v2/apikey"],
    ["router.apikey.js", "delete", "/api/v2/apikey"],
    ["router.rsakey.js", "put", "/api/v2/rsakey"],
    ["router.rsakey.js", "delete", "/api/v2/rsakey"],
    ["router.rsakey.js", "get", "/api/user/rsakey/create"], // state-changing GET
    ["router.rsakey.js", "post", "/api/user/rsakey/revoke"],
    ["router.env.js", "put", "/api/v2/env"],
    ["router.env.js", "delete", "/api/v2/env"],
    ["router.env.js", "post", "/api/user/env/add"],
    ["router.env.js", "post", "/api/user/env/revoke"],
    // D-11 GitHub token link (one array registration serves both paths)
    ["router.github.js", "post", "/api/github/token"],
    ["router.github.js", "post", "/api/v2/github/token"],
    // D-11 admin mutations (CSRF check before requireAdmin)
    ["router.admin.js", "delete", "/api/v2/admin/session/:owner"],
    ["router.admin.js", "post", "/api/v2/admin/impersonate"],
    ["router.admin.js", "post", "/api/v2/admin/user/:id/reactivate"],
    // D-11 device-ownership transfer POSTs (account mutations, not D-21 resources)
    ["router.transfer.js", "post", "/api/v2/transfer/request"],
    ["router.transfer.js", "post", "/api/v2/transfer/decline"],
    ["router.transfer.js", "post", "/api/v2/transfer/accept"],
    ["router.transfer.js", "post", "/api/transfer/request"],
    ["router.transfer.js", "post", "/api/transfer/decline"],
    ["router.transfer.js", "post", "/api/transfer/accept"],
    // quick 261003-skk: mesh mutations, D-21 lifted for lib/router.mesh.js only
    ["router.mesh.js", "post", "/api/mesh/create"],
    ["router.mesh.js", "post", "/api/mesh/delete"],
    ["router.mesh.js", "put", "/api/v2/mesh"],
    ["router.mesh.js", "delete", "/api/v2/mesh"]
];

// [file, method, path, reason]
const NOT_GUARDED = [
    ["router.gdpr.js", "put", "/api/v2/gdpr", "one-shot body token, not cookie-authenticated"],
    ["router.gdpr.js", "post", "/api/gdpr", "one-shot body token, not cookie-authenticated"],
    ["router.gdpr.js", "post", "/api/v2/gdpr", "read carried as POST"],
    ["router.gdpr.js", "post", "/api/gdpr/transfer", "read carried as POST"],
    ["router.user.js", "get", "/api/v2/activate", "e-mail capability link"],
    ["router.user.js", "get", "/api/user/activate", "e-mail capability link"],
    ["router.user.js", "get", "/api/v2/password/reset", "e-mail capability link"],
    ["router.user.js", "get", "/api/user/password/reset", "e-mail capability link"],
    ["router.user.js", "post", "/api/v2/chat", "Tier 3, deferred by D-21"],
    ["router.user.js", "post", "/api/user/chat", "Tier 3, deferred by D-21"],
    ["router.deviceapi.js", "post", "/device/firmware", "firmware API (non-browser)"],
    ["router.deviceapi.js", "post", "/device/register", "firmware API (non-browser)"],
    ["router.profile.js", "get", "/api/v2/profile", "GET read, D-10"],
    ["router.profile.js", "get", "/api/user/profile", "GET read, D-10"],
    ["router.apikey.js", "get", "/api/user/apikey/list", "GET read"],
    ["router.apikey.js", "get", "/api/v2/apikey", "GET read"],
    ["router.rsakey.js", "get", "/api/v2/rsakey", "GET read"],
    ["router.rsakey.js", "get", "/api/user/rsakey/list", "GET read"],
    ["router.env.js", "get", "/api/v2/env", "GET read"],
    ["router.env.js", "get", "/api/user/env/list", "GET read"],
    ["router.admin.js", "get", "/api/v2/admin/users", "GET read"],
    ["router.transfer.js", "get", "/api/v2/transfer/decline", "e-mail capability link"],
    ["router.transfer.js", "get", "/api/v2/transfer/accept", "e-mail capability link"],
    ["router.transfer.js", "get", "/api/transfer/decline", "e-mail capability link"],
    ["router.transfer.js", "get", "/api/transfer/accept", "e-mail capability link"],
    ["router.github.js", "get", "/api/oauth/github", "OAuth redirect flow"],
    ["router.github.js", "get", "/api/oauth/github/callback", "OAuth redirect flow"],
    ["router.google.js", "get", "/api/oauth/google", "OAuth redirect flow"],
    ["router.google.js", "get", "/api/oauth/google/callback", "OAuth redirect flow"],
    // quick 261003-skk: mesh list reads (D-21 lifted for lib/router.mesh.js mutations only)
    ["router.mesh.js", "get", "/api/mesh/list", "GET read"],
    ["router.mesh.js", "post", "/api/mesh/list", "read carried as POST"],
    ["router.mesh.js", "get", "/api/v2/mesh", "GET read"]
];

const sources = {};
function sourceOf(file) {
    if (!(file in sources)) sources[file] = fs.readFileSync(path.join(LIB, file), "utf8");
    return sources[file];
}

// Registration lines for `app.{method}(` with the path quoted in either style
// (array literals such as ['/api/github/token', '/api/v2/github/token'] count).
// Comment lines are ignored so a commented-out route cannot satisfy a row.
function registrationLines(src, method, route) {
    const call = "app." + method + "(";
    return src.split("\n").filter((line) => {
        const t = line.trim();
        if (t.indexOf("//") === 0 || t.indexOf("*") === 0 || t.indexOf("/*") === 0) return false;
        if (line.indexOf(call) === -1) return false;
        return (line.indexOf('"' + route + '"') !== -1) || (line.indexOf("'" + route + "'") !== -1);
    });
}

// Returns null when the row holds, otherwise a message naming the row.
function checkRow(src, row, expectGuarded) {
    const [file, method, route] = row;
    const label = method.toUpperCase() + " " + route + " (" + file + ")";
    const lines = registrationLines(src, method, route);
    if (lines.length === 0) return "registration line not found: " + label;
    if (lines.length > 1) return "registration line is ambiguous (" + lines.length + " matches): " + label;
    const guarded = lines[0].indexOf(GUARD) !== -1;
    if (expectGuarded && !guarded) return "guarded route lacks " + GUARD + ": " + label;
    if (!expectGuarded && guarded) return "excluded route gained " + GUARD + " (reason: " + row[3] + "): " + label;
    return null;
}

describe("CsrfRouteInventorySpec (SEC-CSRF-04/05 guarded-route inventory)", function () {

    it("the row checker fails on a missing line, a missing guard and a guarded exclusion", function () {
        const src = [
            'app.post("/api/a", csrf.verifyCsrfToken, function (req, res) {',
            "app.post('/api/b', function (req, res) {",
            '// app.post("/api/c", csrf.verifyCsrfToken, function (req, res) {'
        ].join("\n");
        expect(checkRow(src, ["x.js", "post", "/api/a"], true)).toBeNull();
        expect(checkRow(src, ["x.js", "post", "/api/b"], false)).toBeNull();
        expect(checkRow(src, ["x.js", "post", "/api/b"], true)).toContain("lacks");
        expect(checkRow(src, ["x.js", "post", "/api/a", "r"], false)).toContain("gained");
        expect(checkRow(src, ["x.js", "post", "/api/c"], true)).toContain("not found");
        expect(checkRow(src, ["x.js", "delete", "/api/a"], true)).toContain("not found");
        expect(checkRow(src, ["x.js", "post", "/api"], true)).toContain("not found");
    });

    GUARDED.forEach((row) => {
        it("guards " + row[1].toUpperCase() + " " + row[2] + " (" + row[0] + ")", function () {
            expect(checkRow(sourceOf(row[0]), row, true)).toBeNull();
        });
    });

    NOT_GUARDED.forEach((row) => {
        it("does not guard " + row[1].toUpperCase() + " " + row[2] + " (" + row[3] + ")", function () {
            expect(checkRow(sourceOf(row[0]), row, false)).toBeNull();
        });
    });

    it("the guarded admin mutations run the CSRF check before requireAdmin (no DB read for a forged request)", function () {
        GUARDED.filter((row) => row[0] === "router.admin.js").forEach((row) => {
            const lines = registrationLines(sourceOf(row[0]), row[1], row[2]);
            expect(lines.length).withContext(row[2]).toBe(1);
            expect((lines[0] || "").indexOf(GUARD + ", requireAdmin") !== -1)
                .withContext(row[1].toUpperCase() + " " + row[2] + " must register " + GUARD + " before requireAdmin").toBe(true);
        });
    });

    it("every router with a guarded row instantiates the csrf factory", function () {
        const files = Array.from(new Set(GUARDED.map((row) => row[0])));
        files.forEach((file) => {
            expect(sourceOf(file).indexOf(FACTORY) !== -1).withContext(file + " lacks " + FACTORY).toBe(true);
        });
    });
});
