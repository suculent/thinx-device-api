/*
 * LogPagingSpec.js — LOG-03 / LOG-04 (phase 26-02)
 *
 * Pure unit tests for lib/thinx/log_paging.js: limit parsing, the opaque
 * owner-free cursor, the owner-bounded CouchDB query and the page slicer.
 * Helper-free; no CouchDB, no config. Owners are synthetic and never printed.
 */

const expect = require('chai').expect;
const paging = require("../../lib/thinx/log_paging");

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);
const UUID = "3f1c2a9e-7b4d-4e21-9a0c-5d6e7f809a1b";
const DOC32 = "0123456789abcdef0123456789abcdef";
const ISO = "2026-09-30T12:34:56.789Z";

function b64(obj) {
  return Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj), "utf8").toString("base64url");
}

function rawDecode(cursor) {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

describe("LOG-03 log_paging.parseLimit", function () {

  it("defaults to 100 when the limit is absent", function () {
    expect(paging.parseLimit(undefined)).to.deep.equal({ ok: true, limit: 100 });
    expect(paging.DEFAULT_LIMIT).to.equal(100);
  });

  it("accepts a digit string", function () {
    expect(paging.parseLimit("50")).to.deep.equal({ ok: true, limit: 50 });
  });

  it("clamps 0 up to 1 and 999 down to 200", function () {
    expect(paging.parseLimit("0")).to.deep.equal({ ok: true, limit: 1 });
    expect(paging.parseLimit("999")).to.deep.equal({ ok: true, limit: 200 });
    expect(paging.MAX_LIMIT).to.equal(200);
  });

  it("rejects non-digits, signs, decimals, more than 4 digits, arrays and the empty string", function () {
    ["abc", "-1", "1.5", "12345", "", " 5", "5 ", "0x10", "1e2"].forEach((raw) => {
      expect(paging.parseLimit(raw), raw).to.deep.equal({ ok: false, reason: "invalid_limit" });
    });
    expect(paging.parseLimit(["1", "2"])).to.deep.equal({ ok: false, reason: "invalid_limit" });
    expect(paging.parseLimit(null)).to.deep.equal({ ok: false, reason: "invalid_limit" });
    expect(paging.parseLimit(5)).to.deep.equal({ ok: false, reason: "invalid_limit" });
  });
});

describe("LOG-03 log_paging cursors", function () {

  it("round-trips an audit cursor (ISO string key)", function () {
    const c = paging.encodeCursor(ISO, DOC32);
    expect(c).to.match(/^[A-Za-z0-9_-]+$/);
    expect(paging.decodeCursor(c, "audit")).to.deep.equal({ ok: true, cursor: { k: ISO, i: DOC32 } });
  });

  it("round-trips a builds cursor (numeric key, including 0)", function () {
    const c = paging.encodeCursor(1790000000000, UUID);
    expect(paging.decodeCursor(c, "builds")).to.deep.equal({ ok: true, cursor: { k: 1790000000000, i: UUID } });
    const z = paging.encodeCursor(0, UUID);
    expect(paging.decodeCursor(z, "builds")).to.deep.equal({ ok: true, cursor: { k: 0, i: UUID } });
  });

  it("an absent cursor decodes to null", function () {
    expect(paging.decodeCursor(undefined, "audit")).to.deep.equal({ ok: true, cursor: null });
  });

  it("the encoded payload has exactly the keys v, k, i and no owner", function () {
    const c = paging.encodeCursor(ISO, UUID);
    const raw = rawDecode(c);
    expect(Object.keys(raw)).to.deep.equal(["v", "k", "i"]);
    expect(raw.v).to.equal(1);
    expect(raw).to.not.have.property("owner");
  });

  it("an encoded cursor for a UUID id and an ISO key holds no 64-hex substring", function () {
    const c = paging.encodeCursor(ISO, UUID);
    expect(Buffer.from(c, "base64url").toString("utf8")).to.not.match(/[a-f0-9]{64}/);
    expect(c).to.not.match(/[a-f0-9]{64}/);
  });

  it("rejects a non-base64url character", function () {
    expect(paging.decodeCursor("abc+def", "audit").ok).to.equal(false);
    expect(paging.decodeCursor("abc=", "audit").ok).to.equal(false);
    expect(paging.decodeCursor("%%%", "audit").ok).to.equal(false);
  });

  it("rejects a string longer than 512 characters and the empty string", function () {
    expect(paging.decodeCursor("A".repeat(513), "audit").ok).to.equal(false);
    expect(paging.decodeCursor("", "audit").ok).to.equal(false);
  });

  it("rejects valid base64url that is not JSON", function () {
    expect(paging.decodeCursor(b64("not json at all"), "audit").ok).to.equal(false);
  });

  it("rejects a JSON array, a JSON scalar and JSON null", function () {
    expect(paging.decodeCursor(b64([1, ISO, DOC32]), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64("42"), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64("null"), "audit").ok).to.equal(false);
  });

  it("rejects v other than 1", function () {
    expect(paging.decodeCursor(b64({ v: 2, k: ISO, i: DOC32 }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: "1", k: ISO, i: DOC32 }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ k: ISO, i: DOC32 }), "audit").ok).to.equal(false);
  });

  it("rejects a missing, empty, too long or control-character i", function () {
    expect(paging.decodeCursor(b64({ v: 1, k: ISO }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: ISO, i: "" }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: ISO, i: "x".repeat(129) }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: ISO, i: "ab\ncd" }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: ISO, i: "ab\u0000" }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: ISO, i: 12 }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: ISO, i: "x".repeat(128) }), "audit").ok).to.equal(true);
  });

  it("audit kind rejects a numeric k and a k longer than 64", function () {
    expect(paging.decodeCursor(b64({ v: 1, k: 5, i: DOC32 }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: "x".repeat(65), i: DOC32 }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: "", i: DOC32 }), "audit").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: { a: 1 }, i: DOC32 }), "audit").ok).to.equal(false);
  });

  it("builds kind rejects a string k, NaN, Infinity and null", function () {
    expect(paging.decodeCursor(b64({ v: 1, k: "123", i: UUID }), "builds").ok).to.equal(false);
    expect(paging.decodeCursor(b64('{"v":1,"k":NaN,"i":"x"}'), "builds").ok).to.equal(false);
    expect(paging.decodeCursor(b64('{"v":1,"k":Infinity,"i":"x"}'), "builds").ok).to.equal(false);
    expect(paging.decodeCursor(b64({ v: 1, k: null, i: UUID }), "builds").ok).to.equal(false);
    // 1e999 is valid JSON that parses to Infinity
    expect(paging.decodeCursor(b64('{"v":1,"k":1e999,"i":"x"}'), "builds").ok).to.equal(false);
  });

  it("rejects an array input (repeated query parameter), null and an unknown kind", function () {
    const good = paging.encodeCursor(ISO, DOC32);
    expect(paging.decodeCursor([good, good], "audit").ok).to.equal(false);
    expect(paging.decodeCursor(null, "audit").ok).to.equal(false);
    expect(paging.decodeCursor(good, "devices").ok).to.equal(false);
  });

  it("never throws on hostile input", function () {
    [{}, 12, true, "-_-_", "____", b64("{"), b64('{"v":1,"k":"x","i":"y","__proto__":{"v":2}}')].forEach((raw) => {
      expect(() => paging.decodeCursor(raw, "audit")).to.not.throw();
    });
  });
});

describe("LOG-03 log_paging.buildQuery", function () {

  it("without a cursor: [owner,{}] .. [owner], descending, limit L+1, no startkey_docid", function () {
    const q = paging.buildQuery(OWNER_A, 100, null);
    expect(q).to.deep.equal({ descending: true, startkey: [OWNER_A, {}], endkey: [OWNER_A], limit: 101 });
    expect(q).to.not.have.property("startkey_docid");
    expect(q).to.not.have.property("skip");
  });

  it("with any cursor the owner still bounds both ends", function () {
    ["￿", 0, 9e15, "", ISO].forEach((k) => {
      const q = paging.buildQuery(OWNER_A, 2, { k: k, i: DOC32 });
      expect(q.startkey).to.deep.equal([OWNER_A, k]);
      expect(q.startkey[0]).to.equal(OWNER_A);
      expect(q.endkey).to.deep.equal([OWNER_A]);
      expect(q.startkey_docid).to.equal(DOC32);
      expect(q.descending).to.equal(true);
      expect(q.limit).to.equal(3);
      expect(q).to.not.have.property("skip");
    });
  });

  it("merges extra (include_docs) but extra can never override the owner bounds or add skip", function () {
    const q = paging.buildQuery(OWNER_A, 10, null, { include_docs: true });
    expect(q.include_docs).to.equal(true);
    const hostile = paging.buildQuery(OWNER_A, 10, null, {
      startkey: ["x"], endkey: ["x"], descending: false, limit: 5000, skip: 10, startkey_docid: "z"
    });
    expect(hostile.startkey).to.deep.equal([OWNER_A, {}]);
    expect(hostile.endkey).to.deep.equal([OWNER_A]);
    expect(hostile.descending).to.equal(true);
    expect(hostile.limit).to.equal(11);
    expect(hostile).to.not.have.property("skip");
    expect(hostile).to.not.have.property("startkey_docid");
  });
});

describe("LOG-03 log_paging.pageFromRows", function () {

  function rows(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ id: "id-" + i, key: [OWNER_A, "2026-01-0" + (9 - i) + "T00:00:00.000Z"], value: { n: i } });
    return out;
  }

  it("L+1 rows give has_more and a cursor at row L; only L rows are returned", function () {
    const r = rows(3);
    const p = paging.pageFromRows(r, 2);
    expect(p.rows).to.deep.equal(r.slice(0, 2));
    expect(p.paging).to.deep.equal({
      limit: 2, has_more: true, next_cursor: paging.encodeCursor(r[2].key[1], r[2].id)
    });
    expect(Object.keys(p.paging)).to.deep.equal(["limit", "has_more", "next_cursor"]);
  });

  it("L or fewer rows give has_more false and next_cursor null", function () {
    expect(paging.pageFromRows(rows(2), 2).paging).to.deep.equal({ limit: 2, has_more: false, next_cursor: null });
    expect(paging.pageFromRows(rows(1), 2).rows).to.have.length(1);
    expect(paging.pageFromRows([], 2).paging.has_more).to.equal(false);
  });

  it("non-array rows give an empty page", function () {
    [undefined, null, {}, "rows"].forEach((x) => {
      expect(paging.pageFromRows(x, 5)).to.deep.equal({ rows: [], paging: { limit: 5, has_more: false, next_cursor: null } });
    });
  });

  it("the next cursor decodes back to the row L key and id", function () {
    const r = rows(3);
    const p = paging.pageFromRows(r, 2);
    expect(paging.decodeCursor(p.paging.next_cursor, "audit")).to.deep.equal({ ok: true, cursor: { k: r[2].key[1], i: r[2].id } });
  });
});

describe("LOG-03 Audit.fetchPage on the owner-keyed view", function () {

  const COUCH_PATH = require.resolve("../../lib/thinx/couch");
  const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
  const fake = { calls: [], rows: [], fail: false };
  let Audit, audit, savedCouch, savedAudit;

  function fakeCouch() {
    const db = {
      view(design, view, q, cb) {
        fake.calls.push({ design: design, view: view, q: JSON.parse(JSON.stringify(q)) });
        if (fake.fail) return cb(Object.assign(new Error("x"), { statusCode: 404, error: "not_found" }));
        cb(null, { total_rows: 999, offset: 0, rows: fake.rows.slice(0, q.limit) });
      }
    };
    return { use: () => db, db: { use: () => db } };
  }

  function page(owner, limit, cursor) {
    return new Promise((resolve) => audit.fetchPage(owner, limit, cursor, (err, body) => resolve({ err: err, body: body })));
  }

  beforeAll(function () {
    savedCouch = require.cache[COUCH_PATH];
    savedAudit = require.cache[AUDIT_PATH];
    require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
    delete require.cache[AUDIT_PATH];
    Audit = require(AUDIT_PATH);
    audit = new Audit();
  });

  afterAll(function () {
    if (savedCouch) require.cache[COUCH_PATH] = savedCouch; else delete require.cache[COUCH_PATH];
    if (savedAudit) require.cache[AUDIT_PATH] = savedAudit; else delete require.cache[AUDIT_PATH];
  });

  beforeEach(function () {
    fake.calls = []; fake.rows = []; fake.fail = false;
  });

  function row(i, extraFlags) {
    const d = "2026-01-01T00:00:0" + (9 - i) + ".000Z";
    return { id: "doc" + i, key: [OWNER_A, d], value: { date: d, message: "m" + i, flags: extraFlags || ["info"] } };
  }

  it("queries paging/audit_by_owner_date with buildQuery and slices to {items, paging}", async function () {
    fake.rows = [row(0), row(1), row(2)];
    const r = await page(OWNER_A, 2, null);
    expect(fake.calls).to.deep.equal([{ design: "paging", view: "audit_by_owner_date", q: paging.buildQuery(OWNER_A, 2, null) }]);
    expect(r.err).to.equal(false);
    expect(Object.keys(r.body)).to.deep.equal(["items", "paging"]);
    expect(r.body.items).to.deep.equal([
      { date: fake.rows[0].value.date, message: "m0", flags: ["info"] },
      { date: fake.rows[1].value.date, message: "m1", flags: ["info"] }
    ]);
    expect(r.body.paging).to.deep.equal({ limit: 2, has_more: true, next_cursor: paging.encodeCursor(fake.rows[2].key[1], "doc2") });
    expect(JSON.stringify(r.body)).to.not.contain("total_rows");
  });

  it("passes the decoded cursor as startkey/startkey_docid inside the owner range", async function () {
    await page(OWNER_A, 5, { k: "2026-01-01T00:00:05.000Z", i: "doc4" });
    expect(fake.calls[0].q.startkey).to.deep.equal([OWNER_A, "2026-01-01T00:00:05.000Z"]);
    expect(fake.calls[0].q.startkey_docid).to.equal("doc4");
    expect(fake.calls[0].q.endkey).to.deep.equal([OWNER_A]);
  });

  it("drops object flags (D-15) and any row outside the owner range", async function () {
    fake.rows = [row(0, [{ password: "h" }]), { id: "x", key: [OWNER_B, "2026"], value: { date: "2026", message: "B", flags: ["info"] } }];
    const r = await page(OWNER_A, 10, null);
    expect(r.body.items).to.deep.equal([{ date: fake.rows[0].value.date, message: "m0", flags: ["info"] }]);
  });

  it("an invalid owner gives an empty page without a query", async function () {
    const r = await page(null, 10, null);
    expect(fake.calls).to.have.length(0);
    expect(r.body).to.deep.equal({ items: [], paging: { limit: 10, has_more: false, next_cursor: null } });
  });

  it("a view error is passed to the callback (no fallback)", async function () {
    fake.fail = true;
    const r = await page(OWNER_A, 10, null);
    expect(r.err).to.be.an("error");
    expect(fake.calls).to.have.length(1);
  });
});
