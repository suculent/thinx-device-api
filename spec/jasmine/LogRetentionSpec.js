// Hermetic specs for lib/thinx/log_retention.js and scripts/log-retention.js
// (Phase 26, LOG-04, D-07..D-11, D-16, D-17).
//
// Every fixture lives under one fs.mkdtempSync tree that is removed in
// afterAll (and rebuilt per case where a case changes it). The CouchDB side is
// an in-memory fake whose views are computed from the REAL map functions in
// design/paging_builds.json and design/paging_logs.json, so the spec follows
// the plan 26-01 view contract instead of a hand-written copy of it. Owner
// ids and UUIDs are synthetic. Nothing here needs Redis, CouchDB, docker or
// the app config.

const fs = require("fs");
const os = require("os");
const path = require("path");
const expect = require("chai").expect;

const safepath = require("../../lib/thinx/safepath");
const LogRetention = require("../../lib/thinx/log_retention");
const cli = require("../../scripts/log-retention");

const DAY = 86400000;
const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const OLD = NOW - 400 * DAY;      // past the 365-day window
const LIVE = NOW - 10 * DAY;      // inside the window
const CUTOFF_ISO = new Date(NOW - 365 * DAY).toISOString();

const OWNER_A = "0123456789abcdef".repeat(4);   // synthetic 64 [a-z0-9]
const OWNER_B = "fedcba9876543210".repeat(4);

function uuid(n) {
    const h = n.toString(16);
    return ("00000000" + h).slice(-8) + "-1111-4222-8333-" + ("000000000000" + h).slice(-12);
}

const U1 = uuid(0x11);     // udid of E, L, T
const U2 = uuid(0x12);     // udid of S
const U3 = uuid(0x13);     // udid holding the orphan candidates
const B_E = uuid(0xe1);
const B_L = uuid(0xe2);
const B_N = uuid(0xe3);
const B_S = uuid(0xe4);
const B_T = uuid(0xe5);
const B_O1 = uuid(0xf1);
const B_O2 = uuid(0xf2);
const B_O3 = uuid(0xf3);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const HEX64_RE = /[0-9a-f]{64}/i;
const LINE_RE = /^(?:[a-z][a-z0-9_]*=[A-Za-z0-9_.:,-]+|LOG-RETENTION (?:DRY-RUN OK|APPLY OK|APPLY INCOMPLETE|FAIL [a-z0-9_:]+))$/;

// ---------------------------------------------------------------------------
// Fake CouchDB: views computed from the real _design/paging map functions.
// ---------------------------------------------------------------------------

function loadMaps(file) {
    const design = JSON.parse(fs.readFileSync(path.join(__dirname, "../../design", file), "utf8"));
    const out = {};
    for (const name of Object.keys(design.views)) out[name] = design.views[name].map;
    return out;
}

const BUILD_MAPS = loadMaps("paging_builds.json");
const LOG_MAPS = loadMaps("paging_logs.json");

function typeRank(v) {
    if (v === null) return 0;
    if (typeof v === "boolean") return 1;
    if (typeof v === "number") return 2;
    if (typeof v === "string") return 3;
    if (Array.isArray(v)) return 4;
    return 5;
}

function collate(a, b) {
    const ta = typeRank(a);
    const tb = typeRank(b);
    if (ta !== tb) return ta - tb;
    if (ta === 4) {
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            const c = collate(a[i], b[i]);
            if (c !== 0) return c;
        }
        return a.length - b.length;
    }
    if (ta === 5) return 0;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

function rowsOf(mapSrc, docs) {
    const rows = [];
    for (const doc of docs) {
        const emit = (key, value) => rows.push({ id: doc._id, key, value, doc });
        const fn = new Function("emit", "return (" + mapSrc + ");")(emit);
        fn(JSON.parse(JSON.stringify(doc)));
    }
    rows.sort((x, y) => collate(x.key, y.key) || (x.id < y.id ? -1 : (x.id > y.id ? 1 : 0)));
    return rows;
}

function fakeDb(name, maps, docs, opts) {
    opts = opts || {};
    const db = {
        name,
        docs,
        viewCalls: [],
        bulkCalls: [],
        events: opts.events || [],
        view(ddoc, view, params) {
            params = Object.assign({}, params || {});
            db.viewCalls.push({ ddoc, view, params });
            if (ddoc !== "paging" || !maps[view]) return Promise.reject(Object.assign(new Error("missing"), { statusCode: 404, error: "not_found" }));
            if (opts.failViews && opts.failViews[view]) {
                return Promise.reject(Object.assign(new Error("boom"), { statusCode: 500, error: "internal_server_error" }));
            }
            if (Object.prototype.hasOwnProperty.call(params, "skip")) {
                return Promise.reject(new Error("skip is not allowed"));
            }
            let rows = (opts.emptyViews && opts.emptyViews[view]) ? [] : rowsOf(maps[view], db.docs);
            if (Object.prototype.hasOwnProperty.call(params, "startkey")) {
                rows = rows.filter((r) => {
                    const c = collate(r.key, params.startkey);
                    if (c > 0) return true;
                    if (c < 0) return false;
                    return (typeof params.startkey_docid !== "string") || r.id >= params.startkey_docid;
                });
            }
            if (Object.prototype.hasOwnProperty.call(params, "endkey")) {
                const inclusive = params.inclusive_end !== false;
                rows = rows.filter((r) => {
                    const c = collate(r.key, params.endkey);
                    return inclusive ? c <= 0 : c < 0;
                });
            }
            const total = rows.length;
            if (typeof params.limit === "number") rows = rows.slice(0, params.limit);
            const out = rows.map((r) => {
                const row = { id: r.id, key: r.key, value: r.value };
                if (params.include_docs === true) row.doc = JSON.parse(JSON.stringify(r.doc));
                return row;
            });
            return Promise.resolve({ total_rows: total, offset: 0, rows: out });
        },
        bulk(body) {
            const docsIn = (body && Array.isArray(body.docs)) ? body.docs : [];
            db.bulkCalls.push(JSON.parse(JSON.stringify(docsIn)));
            db.events.push({ type: "bulk", db: name, ids: docsIn.map((d) => d._id) });
            if (opts.failBulk) return Promise.reject(Object.assign(new Error("down"), { statusCode: 503, error: "unavailable" }));
            const results = [];
            for (const d of docsIn) {
                if (opts.conflictIds && opts.conflictIds.indexOf(d._id) !== -1) {
                    results.push({ id: d._id, error: "conflict", reason: "Document update conflict." });
                    continue;
                }
                const i = db.docs.findIndex((x) => x._id === d._id && x._rev === d._rev);
                if (i === -1) {
                    results.push({ id: d._id, error: "conflict", reason: "Document update conflict." });
                    continue;
                }
                if (d._deleted === true) db.docs.splice(i, 1);
                results.push({ id: d._id, ok: true, rev: "2-x" });
            }
            return Promise.resolve(results);
        }
    };
    return db;
}

function buildDocs() {
    return [
        // E: flat, expired, valid identity, folders in both roots.
        { _id: "a0000000000000000000000000000001", _rev: "1-e", owner: OWNER_A, udid: U1, build_id: B_E, start_time: OLD, timestamp: OLD, state: "success" },
        // L: flat, live.
        { _id: "a0000000000000000000000000000002", _rev: "1-l", owner: OWNER_A, udid: U1, build_id: B_L, start_time: LIVE, timestamp: LIVE, state: "success" },
        // N: nested shape, expired, no udid (invalid identity).
        { _id: B_N, _rev: "1-n", log: [{ owner: OWNER_A, build_id: B_N, start_time: OLD, timestamp: OLD }] },
        // S: flat, expired; its deploy owner dir is a symlink to an outside dir.
        { _id: "a0000000000000000000000000000004", _rev: "1-s", owner: OWNER_B, udid: U2, build_id: B_S, timestamp: OLD + DAY },
        // T: valid identity but no numeric time: absent from builds_by_time.
        { _id: B_T, _rev: "1-t", log: [{ owner: OWNER_A, udid: U1, build_id: B_T, state: "queued" }] }
    ];
}

function auditDocs() {
    return [
        { _id: "c0000000000000000000000000000001", _rev: "1-a1", owner: OWNER_A, date: new Date(OLD).toISOString(), message: "old one", flags: ["info"] },
        { _id: "c0000000000000000000000000000002", _rev: "1-a2", date: new Date(OLD + 2 * DAY).toISOString(), message: "Password missing", flags: ["warning"] },
        { _id: "c0000000000000000000000000000003", _rev: "1-a3", owner: OWNER_A, date: new Date(LIVE).toISOString(), message: "recent", flags: ["info"] }
    ];
}

function fakeClient(opts) {
    opts = opts || {};
    const events = [];
    const builds = fakeDb("managed_builds", BUILD_MAPS, opts.buildDocs || buildDocs(), Object.assign({ events }, opts.builds || {}));
    const logs = fakeDb("managed_logs", LOG_MAPS, opts.auditDocs || auditDocs(), Object.assign({ events }, opts.logs || {}));
    const used = [];
    const prefix = opts.prefix || "";
    return {
        builds, logs, used, events,
        use(name) {
            used.push(name);
            if (name === prefix + "managed_builds") return builds;
            if (name === prefix + "managed_logs") return logs;
            throw new Error("unexpected db " + name);
        }
    };
}

// ---------------------------------------------------------------------------
// Filesystem fixtures.
// ---------------------------------------------------------------------------

let tmp;
let caseNo = 0;

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return Buffer.byteLength(content);
}

function setTimes(p, ms) {
    const t = new Date(ms);
    fs.utimesSync(p, t, t);
}

// Sets the mtime of a directory and each of its direct children (children
// first, so writing them does not bump the directory again).
function ageDir(dir, ms) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (!fs.lstatSync(p).isSymbolicLink()) setTimes(p, ms);
    }
    setTimes(dir, ms);
}

function makeFixture() {
    caseNo += 1;
    const base = path.join(tmp, "case" + caseNo);
    const deploy = path.join(base, "deploy");
    const repos = path.join(base, "repos");
    const evil = path.join(base, "deploy-evil");
    const outside = path.join(base, "outside");
    fs.mkdirSync(deploy, { recursive: true });
    fs.mkdirSync(repos, { recursive: true });
    fs.mkdirSync(evil, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });

    const bytes = { deployRecord: 0, reposRecord: 0, deployOrphan: 0 };

    // E in both roots.
    const eDeploy = path.join(deploy, OWNER_A, U1, B_E);
    bytes.deployRecord += writeFile(path.join(eDeploy, "build.log"), "E deploy build log\n");
    bytes.deployRecord += writeFile(path.join(eDeploy, B_E + ".zip"), "PK-deploy-zip-bytes-0123456789");
    const eRepos = path.join(repos, OWNER_A, U1, B_E);
    bytes.reposRecord += writeFile(path.join(eRepos, "build.log"), "E repos workspace log, a little longer\n");
    bytes.reposRecord += writeFile(path.join(eRepos, B_E + ".zip"), "PK-repos-zip");
    ageDir(eDeploy, OLD);
    ageDir(eRepos, OLD);

    // L (live) in deploy.
    const lDeploy = path.join(deploy, OWNER_A, U1, B_L);
    writeFile(path.join(lDeploy, "build.log"), "L live\n");

    // T (record without time) in deploy, old mtimes.
    const tDeploy = path.join(deploy, OWNER_A, U1, B_T);
    writeFile(path.join(tDeploy, "build.log"), "T timeless\n");
    ageDir(tDeploy, OLD);

    // udid-level OTA files, owner-level avatar, a repo-name dir at depth 3.
    writeFile(path.join(deploy, OWNER_A, U1, "build.json"), "{\"ota\":true}\n");
    writeFile(path.join(deploy, OWNER_A, U1, B_L + ".zip"), "PK-udid-level-zip");
    writeFile(path.join(deploy, OWNER_A, U1, "firmware.bin"), "FW");
    writeFile(path.join(deploy, OWNER_A, "avatar.json"), "{\"avatar\":1}\n");
    const repoDir = path.join(deploy, OWNER_A, U1, "my-repo");
    writeFile(path.join(repoDir, "README.md"), "repo\n");
    ageDir(repoDir, OLD);
    for (const f of ["build.json", B_L + ".zip", "firmware.bin"]) setTimes(path.join(deploy, OWNER_A, U1, f), OLD);
    setTimes(path.join(deploy, OWNER_A, "avatar.json"), OLD);

    // Orphans: O1 old, O2 old dir with a fresh child, O3 fresh.
    const o1 = path.join(deploy, OWNER_A, U3, B_O1);
    bytes.deployOrphan += writeFile(path.join(o1, "build.log"), "orphan one\n");
    bytes.deployOrphan += writeFile(path.join(o1, B_O1 + ".zip"), "PK-orphan-zip-payload");
    ageDir(o1, OLD);
    const o2 = path.join(deploy, OWNER_A, U3, B_O2);
    writeFile(path.join(o2, "build.log"), "orphan two\n");
    writeFile(path.join(o2, "fresh.txt"), "touched today\n");
    setTimes(path.join(o2, "build.log"), OLD);
    setTimes(o2, OLD);
    const o3 = path.join(deploy, OWNER_A, U3, B_O3);
    writeFile(path.join(o3, "build.log"), "orphan three, new\n");

    // S: owner dir in deploy is a symlink to <base>/outside/<owner B>.
    const sOutside = path.join(outside, OWNER_B, U2, B_S);
    writeFile(path.join(sOutside, "build.log"), "S lives outside the root\n");
    ageDir(sOutside, OLD);
    fs.symlinkSync(path.join(outside, OWNER_B), path.join(deploy, OWNER_B));

    // Prefix sibling holding a copy of E's path.
    const eEvil = path.join(evil, OWNER_A, U1, B_E);
    writeFile(path.join(eEvil, "build.log"), "evil twin\n");
    ageDir(eEvil, OLD);

    // Secret file outside every root (Task 2 links to it).
    writeFile(path.join(outside, "secret.txt"), "outside secret\n");

    return { base, deploy, repos, evil, outside, bytes, eDeploy, eRepos, lDeploy, tDeploy, o1, o2, o3, sOutside, eEvil };
}

function listing(dir) {
    const out = [];
    (function walk(d, rel) {
        for (const name of fs.readdirSync(d).sort()) {
            const p = path.join(d, name);
            const r = rel ? rel + "/" + name : name;
            const st = fs.lstatSync(p);
            if (st.isSymbolicLink()) out.push(r + "|link|" + fs.readlinkSync(p));
            else if (st.isDirectory()) { out.push(r + "|dir"); walk(p, r); }
            else out.push(r + "|file|" + st.size);
        }
    })(dir, "");
    return out;
}

function countingFs(log) {
    const wrapped = Object.create(fs);
    for (const name of ["rmSync", "rmdirSync", "unlinkSync", "renameSync", "writeFileSync", "readdirSync", "lstatSync"]) {
        wrapped[name] = function (...args) {
            log.push(name);
            return fs[name].apply(fs, args);
        };
    }
    return wrapped;
}

function envFor(fx, extra) {
    return Object.assign({ RETENTION_DEPLOY_ROOT: fx.deploy, RETENTION_REPOS_ROOT: fx.repos, THINX_PREFIX: "" }, extra || {});
}

function valueOf(lines, key) {
    const hit = lines.find((l) => l.indexOf(key + "=") === 0);
    return hit ? hit.slice(key.length + 1) : undefined;
}

function assertHygiene(lines, fx) {
    expect(lines.length).to.be.above(0);
    const text = lines.join("\n");
    expect(text).to.not.include(OWNER_A);
    expect(text).to.not.include(OWNER_B);
    expect(text).to.not.match(UUID_RE);
    expect(text).to.not.match(HEX64_RE);
    expect(text).to.not.include(tmp);
    expect(text).to.not.include(fs.realpathSync(tmp));
    expect(text).to.not.include(fx.base);
    expect(text).to.not.include("http");
    expect(text).to.not.include("@");
    for (const l of lines) expect(l, "line shape").to.match(LINE_RE);
}

describe("LogRetention (LOG-04)", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running LogRetention spec`);
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-retention-"));
    });

    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(`🚸 [chai] <<< completed LogRetention spec`);
    });

    describe("dry run (default)", function () {

        it("reports the expected aggregates in contract order and exits 0", async function () {
            const fx = makeFixture();
            const client = fakeClient();
            const r = await cli.run([], { env: envFor(fx), client, now: NOW });
            expect(r.code).to.equal(0);
            const keys = r.lines.map((l) => l.split("=")[0]);
            expect(keys).to.deep.equal([
                "mode", "cutoff",
                "audit_expired", "audit_oldest", "audit_newest",
                "build_records", "build_records_expired", "build_records_invalid_identity", "build_record_oldest", "build_record_newest",
                "deploy_record_folders", "deploy_record_bytes", "deploy_record_missing", "deploy_refused",
                "deploy_orphans", "deploy_orphan_bytes", "deploy_orphan_oldest", "deploy_orphan_newest",
                "repos_record_folders", "repos_record_bytes", "repos_record_missing", "repos_refused",
                "repos_orphans", "repos_orphan_bytes", "repos_orphan_oldest", "repos_orphan_newest",
                "orphan_sweep",
                "LOG-RETENTION DRY-RUN OK"
            ]);
            expect(valueOf(r.lines, "mode")).to.equal("dry-run");
            expect(valueOf(r.lines, "cutoff")).to.equal(CUTOFF_ISO.slice(0, 10));
            expect(valueOf(r.lines, "audit_expired")).to.equal("2");
            expect(valueOf(r.lines, "audit_oldest")).to.equal(new Date(OLD).toISOString().slice(0, 10));
            expect(valueOf(r.lines, "audit_newest")).to.equal(new Date(OLD + 2 * DAY).toISOString().slice(0, 10));
            expect(valueOf(r.lines, "build_records")).to.equal("5");
            expect(valueOf(r.lines, "build_records_expired")).to.equal("3");
            expect(valueOf(r.lines, "build_records_invalid_identity")).to.equal("1");
            expect(valueOf(r.lines, "build_record_oldest")).to.equal(new Date(OLD).toISOString().slice(0, 10));
            expect(valueOf(r.lines, "build_record_newest")).to.equal(new Date(OLD + DAY).toISOString().slice(0, 10));
            expect(valueOf(r.lines, "deploy_record_folders")).to.equal("1");
            expect(valueOf(r.lines, "deploy_record_missing")).to.equal("0");
            expect(valueOf(r.lines, "deploy_refused")).to.equal("1");
            expect(valueOf(r.lines, "deploy_orphans")).to.equal("1");
            expect(valueOf(r.lines, "deploy_orphan_oldest")).to.equal(new Date(OLD).toISOString().slice(0, 10));
            expect(valueOf(r.lines, "deploy_orphan_newest")).to.equal(new Date(OLD).toISOString().slice(0, 10));
            expect(valueOf(r.lines, "repos_record_folders")).to.equal("1");
            expect(valueOf(r.lines, "repos_record_missing")).to.equal("1");
            expect(valueOf(r.lines, "repos_refused")).to.equal("0");
            expect(valueOf(r.lines, "repos_orphans")).to.equal("0");
            expect(valueOf(r.lines, "repos_orphan_oldest")).to.equal("none");
            expect(valueOf(r.lines, "orphan_sweep")).to.equal("ran");
        });

        it("byte totals equal the summed fixture file sizes", async function () {
            const fx = makeFixture();
            const r = await cli.run([], { env: envFor(fx), client: fakeClient(), now: NOW });
            expect(r.code).to.equal(0);
            expect(valueOf(r.lines, "deploy_record_bytes")).to.equal(String(fx.bytes.deployRecord));
            expect(valueOf(r.lines, "repos_record_bytes")).to.equal(String(fx.bytes.reposRecord));
            expect(valueOf(r.lines, "deploy_orphan_bytes")).to.equal(String(fx.bytes.deployOrphan));
            expect(valueOf(r.lines, "repos_orphan_bytes")).to.equal("0");
        });

        it("deletes nothing: the fixture tree is identical before and after, no bulk call, no rm", async function () {
            const fx = makeFixture();
            const before = listing(fx.base);
            const client = fakeClient();
            const calls = [];
            const r = await cli.run(["--dry-run"], { env: envFor(fx), client, now: NOW, fs: countingFs(calls) });
            expect(r.code).to.equal(0);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION DRY-RUN OK");
            expect(listing(fx.base)).to.deep.equal(before);
            expect(client.builds.bulkCalls.length).to.equal(0);
            expect(client.logs.bulkCalls.length).to.equal(0);
            for (const name of ["rmSync", "rmdirSync", "unlinkSync", "renameSync", "writeFileSync"]) {
                expect(calls.indexOf(name), name).to.equal(-1);
            }
        });

        it("prints no owner id, UUID, 64-hex value, temp path or URL, and every line is key=value or the final line", async function () {
            const fx = makeFixture();
            const r = await cli.run([], { env: envFor(fx), client: fakeClient(), now: NOW });
            assertHygiene(r.lines, fx);
        });

        it("a record without a numeric time protects its old folder and is never expired", async function () {
            const fx = makeFixture();
            const r = await cli.run([], { env: envFor(fx), client: fakeClient(), now: NOW });
            expect(valueOf(r.lines, "deploy_orphans")).to.equal("1");
            expect(valueOf(r.lines, "build_records_expired")).to.equal("3");
            // Without T's record the same folder is an orphan: the protection comes from builds_by_owner_time.
            const noT = buildDocs().filter((d) => d._id !== B_T);
            const r2 = await cli.run([], { env: envFor(fx), client: fakeClient({ buildDocs: noT }), now: NOW });
            expect(valueOf(r2.lines, "deploy_orphans")).to.equal("2");
        });

        it("reads builds_by_owner_time with include_docs and audit_by_date up to the cutoff, exclusive", async function () {
            const fx = makeFixture();
            const client = fakeClient();
            await cli.run([], { env: envFor(fx), client, now: NOW });
            const audit = client.logs.viewCalls.filter((c) => c.view === "audit_by_date");
            expect(audit.length).to.be.above(0);
            expect(audit[0].params.endkey).to.equal(CUTOFF_ISO);
            expect(audit[0].params.inclusive_end).to.equal(false);
            const owner = client.builds.viewCalls.filter((c) => c.view === "builds_by_owner_time");
            expect(owner.length).to.be.above(0);
            expect(owner[0].params.include_docs).to.equal(true);
            expect(client.builds.viewCalls.filter((c) => c.view === "builds_by_time").length).to.be.above(0);
        });

        it("pages every view with limit batch+1 and startkey/startkey_docid, never skip, with identical totals", async function () {
            const fx = makeFixture();
            const client = fakeClient();
            const lr = new LogRetention({
                logsDb: client.logs, buildsDb: client.builds,
                roots: { deploy: fx.deploy, repos: fx.repos }, now: NOW, batchSize: 1
            });
            const report = await lr.plan();
            const lines = LogRetention.formatReport(report, "dry-run");
            expect(valueOf(lines, "audit_expired")).to.equal("2");
            expect(valueOf(lines, "build_records")).to.equal("5");
            expect(valueOf(lines, "build_records_expired")).to.equal("3");
            expect(valueOf(lines, "deploy_orphans")).to.equal("1");
            const all = client.builds.viewCalls.concat(client.logs.viewCalls);
            for (const c of all) {
                expect(c.params).to.not.have.property("skip");
                expect(c.params.limit).to.equal(2);
            }
            const continued = all.filter((c) => Object.prototype.hasOwnProperty.call(c.params, "startkey"));
            expect(continued.length).to.be.above(2);
            for (const c of continued) expect(typeof c.params.startkey_docid).to.equal("string");
        });
    });

    describe("fail closed", function () {

        for (const view of ["builds_by_time", "builds_by_owner_time"]) {
            it("a rejected " + view + " read is FAIL record_read_failed, exit 1, and no folder is inspected", async function () {
                const fx = makeFixture();
                const before = listing(fx.base);
                const failViews = {};
                failViews[view] = true;
                const client = fakeClient({ builds: { failViews } });
                const calls = [];
                const spy = spyOn(safepath, "resolveInside").and.callThrough();
                const r = await cli.run([], { env: envFor(fx), client, now: NOW, fs: countingFs(calls) });
                expect(r.code).to.equal(1);
                expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION FAIL record_read_failed");
                expect(spy.calls.count()).to.equal(0);
                expect(calls.indexOf("readdirSync")).to.equal(-1);
                expect(calls.indexOf("rmSync")).to.equal(-1);
                expect(listing(fx.base)).to.deep.equal(before);
                assertHygiene(r.lines, fx);
            });
        }

        it("both build views empty aborts the orphan sweep (record_set_empty) and reports no orphans", async function () {
            const fx = makeFixture();
            const client = fakeClient({ builds: { emptyViews: { builds_by_time: true, builds_by_owner_time: true } } });
            const r = await cli.run([], { env: envFor(fx), client, now: NOW });
            expect(r.code).to.equal(0);
            expect(valueOf(r.lines, "orphan_sweep")).to.equal("aborted:record_set_empty");
            expect(valueOf(r.lines, "deploy_orphans")).to.equal("0");
            expect(valueOf(r.lines, "repos_orphans")).to.equal("0");
            expect(valueOf(r.lines, "build_records")).to.equal("0");
        });

        it("a missing root is FAIL root_missing:<name>, exit 1", async function () {
            const fx = makeFixture();
            const env = envFor(fx, { RETENTION_REPOS_ROOT: path.join(fx.base, "no-such-repos") });
            const r = await cli.run([], { env, client: fakeClient(), now: NOW });
            expect(r.code).to.equal(1);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION FAIL root_missing:repos");
            const env2 = envFor(fx, { RETENTION_DEPLOY_ROOT: "relative/deploy" });
            const r2 = await cli.run([], { env: env2, client: fakeClient(), now: NOW });
            expect(r2.code).to.equal(1);
            expect(r2.lines[r2.lines.length - 1]).to.equal("LOG-RETENTION FAIL root_missing:deploy");
            assertHygiene(r.lines.concat(r2.lines), fx);
        });

        it("an unreachable audit view is FAIL audit_read_failed, exit 1", async function () {
            const fx = makeFixture();
            const client = fakeClient({ logs: { failViews: { audit_by_date: true } } });
            const r = await cli.run([], { env: envFor(fx), client, now: NOW });
            expect(r.code).to.equal(1);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION FAIL audit_read_failed");
            assertHygiene(r.lines, fx);
        });
    });

    describe("apply", function () {

        // Task 2 fixture: E's deploy folder also holds a symlink to a file
        // outside every root.
        function makeApplyFixture() {
            const fx = makeFixture();
            fs.symlinkSync(path.join(fx.outside, "secret.txt"), path.join(fx.eDeploy, "link"));
            return fx;
        }

        // fs whose rmSync records each call into the shared event log, and can
        // be told to throw for one directory.
        function recordingFs(events, failFor) {
            const wrapped = Object.create(fs);
            wrapped.rmSync = function (p, opts) {
                events.push({ type: "rm", path: fs.realpathSync(p) });
                if (failFor && fs.realpathSync(p) === fs.realpathSync(failFor)) {
                    throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
                }
                return fs.rmSync(p, opts);
            };
            return wrapped;
        }

        function exists(p) {
            try {
                fs.lstatSync(p);
                return true;
            } catch (_e) {
                return false;
            }
        }

        function survivors(fx) {
            return [
                fx.o2, fx.o3, fx.lDeploy, fx.tDeploy,
                path.join(fx.deploy, OWNER_A, U1, "build.json"),
                path.join(fx.deploy, OWNER_A, U1, B_L + ".zip"),
                path.join(fx.deploy, OWNER_A, U1, "firmware.bin"),
                path.join(fx.deploy, OWNER_A, "avatar.json"),
                path.join(fx.deploy, OWNER_A, U1, "my-repo", "README.md"),
                path.join(fx.eEvil, "build.log"),
                path.join(fx.outside, "secret.txt"),
                path.join(fx.sOutside, "build.log")
            ];
        }

        it("--apply --roots deploy,repos removes E in both roots and O1, keeps everything else, and deletes E and N records", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient();
            const r = await cli.run(["--apply", "--roots", "deploy,repos"], { env: envFor(fx), client, now: NOW, fs: recordingFs(client.events) });
            expect(r.code).to.equal(0);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION APPLY OK");
            expect(exists(fx.eDeploy)).to.equal(false);
            expect(exists(fx.eRepos)).to.equal(false);
            expect(exists(fx.o1)).to.equal(false);
            for (const p of survivors(fx)) expect(exists(p), p.slice(fx.base.length)).to.equal(true);
            expect(fs.readFileSync(path.join(fx.outside, "secret.txt"), "utf8")).to.equal("outside secret\n");
            expect(exists(path.join(fx.deploy, OWNER_B))).to.equal(true);

            const buildDocsDeleted = [].concat(...client.builds.bulkCalls);
            expect(buildDocsDeleted.map((d) => d._id).sort()).to.deep.equal(["a0000000000000000000000000000001", B_N].sort());
            for (const d of buildDocsDeleted) {
                expect(Object.keys(d).sort()).to.deep.equal(["_deleted", "_id", "_rev"]);
                expect(d._deleted).to.equal(true);
            }
            const auditDeleted = [].concat(...client.logs.bulkCalls);
            expect(auditDeleted.map((d) => d._id).sort()).to.deep.equal(["c0000000000000000000000000000001", "c0000000000000000000000000000002"]);
            for (const d of auditDeleted) expect(d).to.deep.equal({ _id: d._id, _rev: d._rev, _deleted: true });

            expect(valueOf(r.lines, "mode")).to.equal("apply");
            expect(valueOf(r.lines, "roots")).to.equal("deploy,repos");
            expect(valueOf(r.lines, "audit")).to.equal("on");
            expect(valueOf(r.lines, "audit_deleted")).to.equal("2");
            expect(valueOf(r.lines, "audit_conflicts")).to.equal("0");
            expect(valueOf(r.lines, "audit_failed")).to.equal("0");
            expect(valueOf(r.lines, "build_records_deleted")).to.equal("2");
            expect(valueOf(r.lines, "build_records_kept")).to.equal("1");
            expect(valueOf(r.lines, "deploy_folders_deleted")).to.equal("1");
            expect(valueOf(r.lines, "deploy_orphans_deleted")).to.equal("1");
            expect(valueOf(r.lines, "deploy_delete_failed")).to.equal("0");
            expect(valueOf(r.lines, "deploy_untracked_after")).to.equal("0");
            expect(valueOf(r.lines, "repos_folders_deleted")).to.equal("1");
            expect(valueOf(r.lines, "repos_orphans_deleted")).to.equal("0");
            expect(valueOf(r.lines, "repos_delete_failed")).to.equal("0");
            expect(valueOf(r.lines, "repos_untracked_after")).to.equal("0");
            assertHygiene(r.lines, fx);
        });

        it("apply output keys follow the dry-run keys in contract order", async function () {
            const fx = makeApplyFixture();
            const r = await cli.run(["--apply", "--roots", "repos,deploy"], { env: envFor(fx), client: fakeClient(), now: NOW });
            const keys = r.lines.map((l) => l.split("=")[0]);
            const tail = keys.slice(keys.indexOf("orphan_sweep") + 1);
            expect(tail).to.deep.equal([
                "roots", "audit", "audit_deleted", "audit_conflicts", "audit_failed",
                "build_records_deleted", "build_records_kept",
                "deploy_folders_deleted", "deploy_orphans_deleted", "deploy_delete_failed", "deploy_untracked_after",
                "repos_folders_deleted", "repos_orphans_deleted", "repos_delete_failed", "repos_untracked_after",
                "LOG-RETENTION APPLY OK"
            ]);
            expect(valueOf(r.lines, "roots")).to.equal("deploy,repos");
        });

        it("every folder rm of a record happens before the bulk call that deletes the record", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient();
            const eDeployReal = fs.realpathSync(fx.eDeploy);
            const eReposReal = fs.realpathSync(fx.eRepos);
            await cli.run(["--apply", "--roots", "deploy,repos"], { env: envFor(fx), client, now: NOW, fs: recordingFs(client.events) });
            const ev = client.events;
            const rmE = ev.findIndex((e) => e.type === "rm" && e.path === eDeployReal);
            const rmER = ev.findIndex((e) => e.type === "rm" && e.path === eReposReal);
            const bulkE = ev.findIndex((e) => e.type === "bulk" && e.db === "managed_builds" && e.ids.indexOf("a0000000000000000000000000000001") !== -1);
            expect(rmE).to.be.at.least(0);
            expect(rmER).to.be.at.least(0);
            expect(bulkE).to.be.above(rmE);
            expect(bulkE).to.be.above(rmER);
        });

        it("--apply --roots deploy leaves E's repos folder (repos_untracked_after=1) and deletes E's record after its deploy folder", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient();
            const eDeployReal = fs.realpathSync(fx.eDeploy);
            const r = await cli.run(["--apply", "--roots", "deploy"], { env: envFor(fx), client, now: NOW, fs: recordingFs(client.events) });
            expect(r.code).to.equal(0);
            expect(exists(fx.eDeploy)).to.equal(false);
            expect(exists(fx.eRepos)).to.equal(true);
            expect(valueOf(r.lines, "roots")).to.equal("deploy");
            expect(valueOf(r.lines, "repos_untracked_after")).to.equal("1");
            expect(valueOf(r.lines, "repos_folders_deleted")).to.equal("0");
            expect(valueOf(r.lines, "build_records_deleted")).to.equal("2");
            const ids = [].concat(...client.builds.bulkCalls).map((d) => d._id);
            expect(ids).to.include("a0000000000000000000000000000001");
            const rmE = client.events.findIndex((e) => e.type === "rm" && e.path === eDeployReal);
            const bulkE = client.events.findIndex((e) => e.type === "bulk" && e.db === "managed_builds");
            expect(rmE).to.be.at.least(0);
            expect(bulkE).to.be.above(rmE);
            for (const e of client.events) {
                if (e.type === "rm") expect(e.path.indexOf(fs.realpathSync(fx.repos))).to.equal(-1);
            }
            assertHygiene(r.lines, fx);
        });

        it("--apply --roots none removes no folder and makes no build bulk call, but still expires audit docs", async function () {
            const fx = makeApplyFixture();
            const before = listing(fx.base);
            const client = fakeClient();
            const r = await cli.run(["--apply", "--roots", "none"], { env: envFor(fx), client, now: NOW, fs: recordingFs(client.events) });
            expect(r.code).to.equal(0);
            expect(listing(fx.base)).to.deep.equal(before);
            expect(client.builds.bulkCalls.length).to.equal(0);
            expect(client.logs.bulkCalls.length).to.equal(1);
            expect(valueOf(r.lines, "roots")).to.equal("none");
            expect(valueOf(r.lines, "audit_deleted")).to.equal("2");
            expect(valueOf(r.lines, "build_records_deleted")).to.equal("0");
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION APPLY OK");
        });

        it("--apply --roots none --no-audit makes no bulk call of any kind", async function () {
            const fx = makeApplyFixture();
            const before = listing(fx.base);
            const client = fakeClient();
            const r = await cli.run(["--apply", "--roots", "none", "--no-audit"], { env: envFor(fx), client, now: NOW, fs: recordingFs(client.events) });
            expect(r.code).to.equal(0);
            expect(listing(fx.base)).to.deep.equal(before);
            expect(client.builds.bulkCalls.length).to.equal(0);
            expect(client.logs.bulkCalls.length).to.equal(0);
            expect(valueOf(r.lines, "audit")).to.equal("off");
            expect(valueOf(r.lines, "audit_deleted")).to.equal("0");
        });

        it("a failed rm of E's deploy folder keeps E's record and ends APPLY INCOMPLETE with exit 1", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient();
            const r = await cli.run(["--apply", "--roots", "deploy,repos"], { env: envFor(fx), client, now: NOW, fs: recordingFs(client.events, fx.eDeploy) });
            expect(r.code).to.equal(1);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION APPLY INCOMPLETE");
            expect(valueOf(r.lines, "deploy_delete_failed")).to.equal("1");
            expect(exists(fx.eDeploy)).to.equal(true);
            const ids = [].concat(...client.builds.bulkCalls).map((d) => d._id);
            expect(ids).to.not.include("a0000000000000000000000000000001");
            expect(ids).to.include(B_N);
            expect(valueOf(r.lines, "build_records_kept")).to.equal("2");
            assertHygiene(r.lines, fx);
        });

        it("a bulk conflict for N counts it as kept and ends APPLY INCOMPLETE", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient({ builds: { conflictIds: [B_N] } });
            const r = await cli.run(["--apply", "--roots", "deploy,repos"], { env: envFor(fx), client, now: NOW });
            expect(r.code).to.equal(1);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION APPLY INCOMPLETE");
            expect(valueOf(r.lines, "build_records_deleted")).to.equal("1");
            expect(valueOf(r.lines, "build_records_kept")).to.equal("2");
        });

        it("a rejected bulk call keeps every record of the batch and ends APPLY INCOMPLETE", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient({ builds: { failBulk: true } });
            const r = await cli.run(["--apply", "--roots", "deploy,repos"], { env: envFor(fx), client, now: NOW });
            expect(r.code).to.equal(1);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION APPLY INCOMPLETE");
            expect(valueOf(r.lines, "build_records_deleted")).to.equal("0");
            expect(valueOf(r.lines, "build_records_kept")).to.equal("3");
            assertHygiene(r.lines, fx);
        });

        it("re-checks containment right before rm: a folder swapped for a symlink after plan() is refused and its target survives", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient();
            const lr = new LogRetention({ logsDb: client.logs, buildsDb: client.builds, roots: { deploy: fx.deploy, repos: fx.repos }, now: NOW });
            const report = await lr.plan();
            // Swap E's deploy folder for a symlink to an outside directory.
            const victim = path.join(fx.outside, "victim");
            writeFile(path.join(victim, "keep.txt"), "must survive\n");
            fs.rmSync(fx.eDeploy, { recursive: true, force: true });
            fs.symlinkSync(victim, fx.eDeploy);
            const spy = spyOn(safepath, "resolveInside").and.callThrough();
            const result = await lr.apply(report, { roots: ["deploy", "repos"], audit: true });
            expect(spy.calls.count()).to.be.above(0);
            expect(fs.readFileSync(path.join(victim, "keep.txt"), "utf8")).to.equal("must survive\n");
            expect(fs.lstatSync(fx.eDeploy).isSymbolicLink()).to.equal(true);
            const lines = LogRetention.formatReport(report, "apply", result);
            expect(valueOf(lines, "deploy_delete_failed")).to.equal("1");
            expect(lines[lines.length - 1]).to.equal("LOG-RETENTION APPLY INCOMPLETE");
            const ids = [].concat(...client.builds.bulkCalls).map((d) => d._id);
            expect(ids).to.not.include("a0000000000000000000000000000001");
            assertHygiene(lines, fx);
        });

        it("a second plan after a full apply finds only the refused record S and no orphan", async function () {
            const fx = makeApplyFixture();
            const client = fakeClient();
            const a = await cli.run(["--apply", "--roots", "deploy,repos"], { env: envFor(fx), client, now: NOW });
            expect(a.code).to.equal(0);
            const r = await cli.run([], { env: envFor(fx), client, now: NOW });
            expect(r.code).to.equal(0);
            expect(valueOf(r.lines, "build_records_expired")).to.equal("1");
            expect(valueOf(r.lines, "deploy_refused")).to.equal("1");
            expect(valueOf(r.lines, "deploy_orphans")).to.equal("0");
            expect(valueOf(r.lines, "repos_orphans")).to.equal("0");
            expect(valueOf(r.lines, "audit_expired")).to.equal("0");
            assertHygiene(r.lines, fx);
        });
    });

    describe("CLI usage", function () {

        const bad = [
            ["--apply"],
            ["--apply", "--roots", "bogus"],
            ["--apply", "--roots"],
            ["--apply", "--roots", "none,deploy"],
            ["--roots", "deploy"],
            ["--no-audit"],
            ["--apply", "--dry-run", "--roots", "deploy"],
            ["--frobnicate"]
        ];
        for (const argv of bad) {
            it("refuses `" + argv.join(" ") + "` with exit 2 before any CouchDB or filesystem access", async function () {
                const client = fakeClient();
                const calls = [];
                const r = await cli.run(argv, { env: { RETENTION_DEPLOY_ROOT: "/nonexistent-a", RETENTION_REPOS_ROOT: "/nonexistent-b" }, client, now: NOW, fs: countingFs(calls) });
                expect(r.code).to.equal(2);
                expect(client.used.length).to.equal(0);
                expect(calls.length).to.equal(0);
            });
        }

        it("--help prints usage and exits 0 without touching CouchDB", async function () {
            const client = fakeClient();
            const r = await cli.run(["--help"], { env: {}, client, now: NOW });
            expect(r.code).to.equal(0);
            expect(client.used.length).to.equal(0);
            expect(r.lines.join("\n")).to.include("--apply --roots");
        });

        it("uses THINX_PREFIX for the two DB names", async function () {
            const fx = makeFixture();
            const client = fakeClient({ prefix: "test_" });
            const r = await cli.run([], { env: envFor(fx, { THINX_PREFIX: "test_" }), client, now: NOW });
            expect(r.code).to.equal(0);
            expect(client.used.slice().sort()).to.deep.equal(["test_managed_builds", "test_managed_logs"]);
        });

        it("without credentials and without an injected client it is FAIL missing_credentials, exit 1", async function () {
            const fx = makeFixture();
            const r = await cli.run([], { env: envFor(fx), now: NOW });
            expect(r.code).to.equal(1);
            expect(r.lines[r.lines.length - 1]).to.equal("LOG-RETENTION FAIL missing_credentials");
        });
    });
});
