// D-15 credential cleanup CLI (scripts/clear-leaked-credentials.js), driven
// end to end against an in-memory fake CouchDB. No network, no globals, no
// real data: every id, key and address below is synthetic.
//
// The spec proves four things: the dry run only reads, each --apply target
// changes only what it names, a dry run after a complete apply reports zero,
// and no output line ever carries an id, a 64-hex value, an address or a URL.

const expect = require('chai').expect;
const fs = require('fs');
const Script = require("../../scripts/clear-leaked-credentials.js");

// Synthetic values only.
const USER_A = "a".repeat(64);
const USER_B = "b".repeat(64);
const USER_C = "d".repeat(64);
const KEY_1 = "c".repeat(64);
const KEY_2 = "e".repeat(64);
const HASH = "f".repeat(64);
const MAIL = "x@y.z";
const AUDIT_IDS = ["audit-fixture-0001", "audit-fixture-0002", "audit-fixture-0003", "audit-fixture-0004"];
const FIXTURE_IDS = [USER_A, USER_B, USER_C].concat(AUDIT_IDS);

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function userDocs() {
  return [
    { _id: "_design/users", _rev: "1-design", reset_key: "design-docs-must-be-skipped" },
    { _id: USER_A, _rev: "1-ua", owner: USER_A, email: MAIL, password: HASH, reset_key: KEY_1, info: { first_name: "A" } },
    { _id: USER_B, _rev: "1-ub", owner: USER_B, email: MAIL, password: HASH, reset_key: KEY_2, info: { first_name: "B" } },
    { _id: USER_C, _rev: "1-uc", owner: USER_C, email: MAIL, password: HASH, reset_key: null, info: { first_name: "C" } }
  ];
}

function auditDocs() {
  return [
    { _id: "_design/logs", _rev: "1-design", flags: [{ password: HASH }] },
    {
      _id: AUDIT_IDS[0], _rev: "1-a1", owner: USER_A, message: "Profile updated successfully.",
      date: "2025-10-01T08:15:30.000Z",
      flags: [{ password: HASH, reset_key: KEY_1, email: MAIL, repos: {} }]
    },
    {
      _id: AUDIT_IDS[1], _rev: "1-a2", owner: USER_B, message: "Atomic tag updated successfully.",
      date: "2026-09-30T21:42:05.000Z",
      flags: ["warning", { repos: {} }]
    },
    { _id: AUDIT_IDS[2], _rev: "1-a3", owner: USER_A, message: "User logged in", date: "2026-01-01T00:00:00.000Z", flags: ["info"] },
    { _id: AUDIT_IDS[3], _rev: "1-a4", owner: USER_B, message: "Something failed", date: "2026-02-01T00:00:00.000Z", flags: "error" }
  ];
}

// In-memory database with the subset of the nano db API the script uses.
// The atomic() fake mirrors design/design_users.json updates.edit: it sets
// the named fields on the latest revision and answers with the whole doc.
function fakeDb(docs, opts) {
  opts = opts || {};
  const db = {
    docs: clone(docs),
    calls: { list: [], atomic: [], bulk: [] },
    list(params) {
      db.calls.list.push(clone(params));
      if (opts.listError) return Promise.reject(opts.listError);
      const sorted = db.docs.slice().sort((x, y) => (x._id < y._id ? -1 : (x._id > y._id ? 1 : 0)));
      const from = (typeof params.startkey === "string") ? sorted.filter((d) => d._id >= params.startkey) : sorted;
      const page = from.slice(0, params.limit);
      return Promise.resolve({
        total_rows: sorted.length,
        offset: 0,
        rows: page.map((d) => ({ id: d._id, key: d._id, value: { rev: d._rev }, doc: params.include_docs ? clone(d) : undefined }))
      });
    },
    atomic(ddoc, name, id, body) {
      db.calls.atomic.push({ ddoc, name, id, body: clone(body) });
      if (opts.atomicError) return Promise.reject(opts.atomicError);
      const doc = db.docs.find((d) => d._id === id);
      if (!doc) return Promise.reject({ statusCode: 404, error: "not_found" });
      for (const k of Object.keys(body)) {
        if (k === "admin" || k === "owner" || k === "_id") continue;
        doc[k] = body[k];
      }
      doc._rev = "2-" + doc._rev;
      return Promise.resolve(JSON.stringify(doc));
    },
    bulk(payload) {
      db.calls.bulk.push(clone(payload));
      const results = payload.docs.map((next) => {
        if (opts.conflictIds && opts.conflictIds.indexOf(next._id) !== -1) {
          return { id: next._id, error: "conflict", reason: "Document update conflict." };
        }
        const i = db.docs.findIndex((d) => d._id === next._id);
        if (i === -1 || db.docs[i]._rev !== next._rev) {
          return { id: next._id, error: "conflict", reason: "Document update conflict." };
        }
        const stored = clone(next);
        stored._rev = "2-" + next._rev;
        db.docs[i] = stored;
        return { id: next._id, ok: true, rev: stored._rev };
      });
      return Promise.resolve(results);
    }
  };
  return db;
}

function fakeClient(opts) {
  opts = opts || {};
  const dbs = {
    managed_users: fakeDb(opts.users || userDocs(), opts.usersOpts),
    managed_logs: fakeDb(opts.audit || auditDocs(), opts.auditOpts)
  };
  const client = {
    dbs,
    uses: [],
    use(name) {
      client.uses.push(name);
      if (!dbs[name]) throw new Error("unexpected db name");
      return dbs[name];
    }
  };
  return client;
}

function kv(lines) {
  const out = {};
  for (const l of lines) {
    const i = l.indexOf("=");
    if (i > 0) out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

// Every captured output across the spec, checked once more at the end.
const ALL_OUTPUT = [];
async function run(argv, client) {
  const r = await Script.run(argv, { client, env: {} });
  for (const l of r.lines) ALL_OUTPUT.push(l);
  return r;
}

function assertClean(lines) {
  for (const l of lines) {
    expect(/[0-9a-f]{64}/.test(l), "64-hex value in output").to.equal(false);
    expect(l.indexOf("@"), "address in output").to.equal(-1);
    expect(l.toLowerCase().indexOf("http"), "url in output").to.equal(-1);
    for (const id of FIXTURE_IDS) expect(l.indexOf(id), "doc id in output").to.equal(-1);
  }
}

describe("clear-leaked-credentials helpers", function () {

  it("hasObjectFlag is true only when a flag element is not a string", function () {
    expect(Script.hasObjectFlag({ flags: ["info"] })).to.equal(false);
    expect(Script.hasObjectFlag({ flags: "error" })).to.equal(false);
    expect(Script.hasObjectFlag({})).to.equal(false);
    expect(Script.hasObjectFlag({ flags: ["warning", { repos: {} }] })).to.equal(true);
    expect(Script.hasObjectFlag({ flags: { password: HASH } })).to.equal(true);
  });

  it("stringFlags keeps short non-empty strings and falls back to ['info']", function () {
    expect(Script.stringFlags([{ password: HASH, reset_key: KEY_1 }])).to.deep.equal(["info"]);
    expect(Script.stringFlags(["warning", { repos: {} }])).to.deep.equal(["warning"]);
    expect(Script.stringFlags("error")).to.deep.equal(["error"]);
    expect(Script.stringFlags(["", "x".repeat(33), 7, null])).to.deep.equal(["info"]);
    expect(Script.stringFlags(["admin", "impersonation"])).to.deep.equal(["admin", "impersonation"]);
  });
});

describe("clear-leaked-credentials CLI", function () {

  let writeSpies;
  beforeEach(function () {
    writeSpies = [
      spyOn(fs, "writeFileSync").and.callThrough(),
      spyOn(fs, "createWriteStream").and.callThrough(),
      spyOn(fs, "appendFileSync").and.callThrough()
    ];
  });
  afterEach(function () {
    for (const s of writeSpies) expect(s.calls.count(), "file write").to.equal(0);
  });

  it("dry run (default) reports aggregates in contract order and writes nothing", async function () {
    const client = fakeClient();
    const r = await run([], client);
    expect(r.code).to.equal(0);
    const keys = r.lines.filter((l) => l.indexOf("=") > 0).map((l) => l.split("=")[0]);
    expect(keys).to.deep.equal([
      "mode", "db_users", "db_logs", "users_scanned", "users_with_reset_key",
      "audit_scanned", "audit_with_object_flags",
      "audit_object_flags_with_password", "audit_object_flags_with_reset_key",
      "audit_object_flags_with_email", "audit_object_flags_with_repos",
      "audit_object_flags_oldest", "audit_object_flags_newest"
    ]);
    const v = kv(r.lines);
    expect(v.mode).to.equal("dry-run");
    expect(v.db_users).to.equal("managed_users");
    expect(v.db_logs).to.equal("managed_logs");
    expect(v.users_scanned).to.equal("3");
    expect(v.users_with_reset_key).to.equal("2");
    expect(v.audit_scanned).to.equal("4");
    expect(v.audit_with_object_flags).to.equal("2");
    expect(v.audit_object_flags_with_password).to.equal("1");
    expect(v.audit_object_flags_with_reset_key).to.equal("1");
    expect(v.audit_object_flags_with_email).to.equal("1");
    expect(v.audit_object_flags_with_repos).to.equal("2");
    expect(v.audit_object_flags_oldest).to.equal("2025-10-01");
    expect(v.audit_object_flags_newest).to.equal("2026-09-30T21:42Z");
    expect(r.lines[r.lines.length - 1]).to.equal("CLEANUP-DRY-RUN OK");
    expect(client.dbs.managed_users.calls.atomic.length).to.equal(0);
    expect(client.dbs.managed_users.calls.bulk.length).to.equal(0);
    expect(client.dbs.managed_logs.calls.atomic.length).to.equal(0);
    expect(client.dbs.managed_logs.calls.bulk.length).to.equal(0);
    assertClean(r.lines);
  });

  it("--dry-run pages with limit batch+1 and startkey, giving the same counts", async function () {
    const client = fakeClient();
    const r = await run(["--dry-run", "--batch-size", "2"], client);
    expect(r.code).to.equal(0);
    const v = kv(r.lines);
    expect(v.users_scanned).to.equal("3");
    expect(v.users_with_reset_key).to.equal("2");
    expect(v.audit_scanned).to.equal("4");
    expect(v.audit_with_object_flags).to.equal("2");
    const calls = client.dbs.managed_logs.calls.list;
    expect(calls.length).to.be.greaterThan(1);
    for (const c of calls) {
      expect(c.limit).to.equal(3);
      expect(c.include_docs).to.equal(true);
    }
    expect(calls[0].startkey).to.equal(undefined);
    expect(calls[1].startkey).to.be.a("string");
  });

  it("--apply --targets reset-keys clears reset_key through users/edit only", async function () {
    const client = fakeClient();
    const before = clone(client.dbs.managed_users.docs);
    const r = await run(["--apply", "--targets", "reset-keys"], client);
    expect(r.code).to.equal(0);
    const v = kv(r.lines);
    expect(v.mode).to.equal("apply");
    expect(v.targets).to.equal("reset-keys");
    expect(v.users_cleared).to.equal("2");
    expect(v.users_failed).to.equal("0");
    expect(v.audit_redacted).to.equal("0");
    expect(r.lines[r.lines.length - 1]).to.equal("CLEANUP-APPLY OK");

    const atomic = client.dbs.managed_users.calls.atomic;
    expect(atomic.length).to.equal(2);
    for (const c of atomic) {
      expect(c.ddoc).to.equal("users");
      expect(c.name).to.equal("edit");
      expect(c.body).to.deep.equal({ reset_key: null });
    }
    expect(atomic.map((c) => c.id).sort()).to.deep.equal([USER_A, USER_B]);
    expect(client.dbs.managed_users.calls.bulk.length).to.equal(0);
    expect(client.dbs.managed_logs.calls.bulk.length).to.equal(0);
    expect(client.dbs.managed_logs.calls.atomic.length).to.equal(0);

    // Only reset_key (and the revision) changed on the user documents.
    for (const after of client.dbs.managed_users.docs) {
      const orig = before.find((d) => d._id === after._id);
      const a = clone(after); const o = clone(orig);
      delete a._rev; delete o._rev; delete a.reset_key; delete o.reset_key;
      expect(a).to.deep.equal(o);
    }

    const again = await run([], client);
    const w = kv(again.lines);
    expect(w.users_with_reset_key).to.equal("0");
    expect(w.audit_with_object_flags).to.equal("2");
    assertClean(r.lines);
    assertClean(again.lines);
  });

  it("--apply --targets audit-flags rewrites only flags of the affected docs in one bulk write", async function () {
    const client = fakeClient();
    const before = clone(client.dbs.managed_logs.docs);
    const r = await run(["--apply", "--targets", "audit-flags"], client);
    expect(r.code).to.equal(0);
    const v = kv(r.lines);
    expect(v.targets).to.equal("audit-flags");
    expect(v.users_cleared).to.equal("0");
    expect(v.audit_redacted).to.equal("2");
    expect(v.audit_conflicts).to.equal("0");
    expect(v.audit_failed).to.equal("0");
    expect(r.lines[r.lines.length - 1]).to.equal("CLEANUP-APPLY OK");

    expect(client.dbs.managed_users.calls.atomic.length).to.equal(0);
    const bulk = client.dbs.managed_logs.calls.bulk;
    expect(bulk.length).to.equal(1);
    const sent = bulk[0].docs;
    expect(sent.map((d) => d._id)).to.deep.equal([AUDIT_IDS[0], AUDIT_IDS[1]]);
    expect(sent[0].flags).to.deep.equal(["info"]);
    expect(sent[1].flags).to.deep.equal(["warning"]);
    for (const d of sent) {
      const orig = before.find((o) => o._id === d._id);
      expect(d._rev).to.equal(orig._rev);
      const a = clone(d); const o = clone(orig);
      delete a.flags; delete o.flags;
      expect(a).to.deep.equal(o);
    }

    const again = await run([], client);
    const w = kv(again.lines);
    expect(w.audit_with_object_flags).to.equal("0");
    expect(w.audit_object_flags_oldest).to.equal("none");
    expect(w.audit_object_flags_newest).to.equal("none");
    expect(w.users_with_reset_key).to.equal("2");
    assertClean(r.lines);
    assertClean(again.lines);
  });

  it("--apply with both targets converges to zero, and a second apply is a no-op", async function () {
    const client = fakeClient();
    const r = await run(["--apply", "--targets", "reset-keys,audit-flags"], client);
    expect(r.code).to.equal(0);
    expect(kv(r.lines).targets).to.equal("reset-keys,audit-flags");
    const again = await run([], client);
    const w = kv(again.lines);
    expect(w.users_with_reset_key).to.equal("0");
    expect(w.audit_with_object_flags).to.equal("0");
    expect(again.lines[again.lines.length - 1]).to.equal("CLEANUP-DRY-RUN OK");

    const atomicBefore = client.dbs.managed_users.calls.atomic.length;
    const bulkBefore = client.dbs.managed_logs.calls.bulk.length;
    const second = await run(["--apply", "--targets", "audit-flags,reset-keys"], client);
    expect(second.code).to.equal(0);
    expect(kv(second.lines).users_cleared).to.equal("0");
    expect(kv(second.lines).audit_redacted).to.equal("0");
    expect(client.dbs.managed_users.calls.atomic.length).to.equal(atomicBefore);
    expect(client.dbs.managed_logs.calls.bulk.length).to.equal(bulkBefore);
  });

  it("a bulk conflict is reported as CLEANUP-APPLY INCOMPLETE with exit 1", async function () {
    const client = fakeClient({ auditOpts: { conflictIds: [AUDIT_IDS[1]] } });
    const r = await run(["--apply", "--targets", "audit-flags"], client);
    expect(r.code).to.equal(1);
    const v = kv(r.lines);
    expect(v.audit_redacted).to.equal("1");
    expect(v.audit_conflicts).to.equal("1");
    expect(v.audit_failed).to.equal("0");
    expect(r.lines[r.lines.length - 1]).to.equal("CLEANUP-APPLY INCOMPLETE");
    assertClean(r.lines);
  });

  it("a failed users/edit call is counted, reported by status only, and exits 1", async function () {
    const client = fakeClient({ usersOpts: { atomicError: { statusCode: 500, error: "internal_server_error", reason: "doc " + USER_A } } });
    const r = await run(["--apply", "--targets", "reset-keys"], client);
    expect(r.code).to.equal(1);
    const v = kv(r.lines);
    expect(v.users_cleared).to.equal("0");
    expect(v.users_failed).to.equal("2");
    expect(r.lines).to.include("error=500:internal_server_error");
    expect(r.lines[r.lines.length - 1]).to.equal("CLEANUP-APPLY INCOMPLETE");
    assertClean(r.lines);
  });

  it("refuses --apply without --targets, or with an unknown target, before any CouchDB call", async function () {
    const cases = [
      ["--apply"],
      ["--apply", "--targets"],
      ["--apply", "--targets", "bogus"],
      ["--apply", "--targets", "reset-keys,bogus"],
      ["--targets", "reset-keys"],
      ["--apply", "--dry-run", "--targets", "reset-keys"],
      ["--batch-size", "501"],
      ["--batch-size", "0"],
      ["--what"]
    ];
    for (const argv of cases) {
      const client = fakeClient();
      const r = await run(argv, client);
      expect(r.code, argv.join(" ")).to.equal(2);
      expect(client.uses.length, argv.join(" ")).to.equal(0);
    }
  });

  it("--help prints usage and exits 0 without touching CouchDB", async function () {
    const client = fakeClient();
    const r = await run(["--help"], client);
    expect(r.code).to.equal(0);
    expect(r.lines.join("\n")).to.match(/Usage:/);
    expect(client.uses.length).to.equal(0);
  });

  it("reduces a credentialed CouchDB error to status and error code only", async function () {
    const err = { statusCode: 401, error: "unauthorized", reason: "Name or password is incorrect.", request: { url: "http://u:p@couchdb:5984" }, message: "auth failed for http://u:p@couchdb:5984" };
    const client = fakeClient({ usersOpts: { listError: err }, auditOpts: { listError: err } });
    const r = await run([], client);
    expect(r.code).to.equal(1);
    expect(r.lines).to.include("error=401:unauthorized");
    const text = r.lines.join("\n");
    expect(text).not.to.contain("u:p");
    expect(text).not.to.contain("couchdb:5984");
    expect(text).not.to.contain("incorrect");
    expect(text).not.to.contain("CLEANUP-DRY-RUN OK");
    assertClean(r.lines);
  });

  it("reduces a nano socket failure to its errno token", async function () {
    const err = new Error("error happened in your connection. Reason: Error: connect ECONNREFUSED 10.0.0.1:5984");
    const client = fakeClient({ usersOpts: { listError: err } });
    const r = await run([], client);
    expect(r.code).to.equal(1);
    expect(r.lines).to.include("error=none:ECONNREFUSED");
    expect(r.lines.join("\n")).not.to.contain("10.0.0.1");
  });

  it("no captured output in this spec carries an id, a 64-hex value, an address or a URL", async function () {
    // Self-sufficient when run alone (--filter): produce at least one run.
    if (ALL_OUTPUT.length === 0) await run([], fakeClient());
    expect(ALL_OUTPUT.length).to.be.greaterThan(10);
    assertClean(ALL_OUTPUT);
  });
});
