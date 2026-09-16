/*
 * ZZ-CouchCallbackShimSpec.js — lib/thinx/couch.js regression spec
 *
 * nano 11 is promise-only; lib/thinx/couch.js restores nano 10 callback
 * semantics for the ~50 callback-style CouchDB call sites while leaving
 * promise/await call sites untouched. Tested against a fake nano client so
 * no CouchDB is required.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const expect = require('chai').expect;
const couch = require("../../lib/thinx/couch");

function fakeClient() {
    const scope = {
        name: "managed_x",
        config: { url: "http://couch:5984" },
        get(id) { return id === "missing" ? Promise.reject(Object.assign(new Error("missing"), { statusCode: 404, error: "not_found", reason: "missing" })) : Promise.resolve({ _id: id }); },
        insert(doc) { if (doc === "boom") throw new Error("sync boom"); return Promise.resolve({ ok: true, id: doc._id }); },
        atomic(design, name, id, body) { return Promise.resolve({ design, name, id, body }); },
        // CouchDB update handlers answer without application/json -> nano 11 yields a string
        update(id) { return Promise.resolve(JSON.stringify({ _id: id, _rev: "2-x", ok: true })); },
        plain() { return Promise.resolve("OK"); },
        listAsStream() { return "a-stream"; },
        attachment: { get(id, name) { return Promise.resolve(id + "/" + name); } },
        multipart: { insert() { return Promise.resolve("mp"); } }
    };
    scope.server = null;
    const client = {
        config: { url: "http://couch:5984" },
        db: {
            list() { return Promise.resolve(["managed_x"]); },
            create(_name) { return Promise.reject(Object.assign(new Error("the file already exists"), { statusCode: 412 })); },
            use(name) { scope.name = name; return scope; },
            scope(name) { scope.name = name; return scope; }
        },
        use(name) { return client.db.use(name); },
        scope(name) { return client.db.use(name); },
        request(opts) { return Promise.resolve(opts); }
    };
    return client;
}

describe("couch callback shim", function () {

    let client;
    beforeEach(() => { client = couch.wrapClient(fakeClient()); });

    it("invokes trailing callback with (null, body, undefined) on success", function (done) {
        client.db.list((err, body, headers) => {
            expect(err).to.equal(null);
            expect(body).to.deep.equal(["managed_x"]);
            expect(headers).to.equal(undefined);
            done();
        });
    });

    it("invokes trailing callback with the nano error on rejection", function (done) {
        client.db.create("managed_y", (err, body) => {
            expect(err).to.be.instanceOf(Error);
            expect(err.statusCode).to.equal(412);
            expect(err.toString()).to.contain("the file already exists");
            expect(body).to.equal(undefined);
            done();
        });
    });

    it("returns the promise untouched when no callback is passed", function (done) {
        const p = client.db.list();
        expect(p).to.be.instanceOf(Promise);
        p.then((body) => { expect(body).to.deep.equal(["managed_x"]); done(); });
    });

    it("returns undefined (not a promise) when a callback is passed", function () {
        const r = client.db.list(() => { /* noop */ });
        expect(r).to.equal(undefined);
    });

    it("wraps document scopes returned by db.use / use / scope", function (done) {
        const lib = client.db.use("managed_users");
        expect(lib.name).to.equal("managed_users");
        lib.get("abc", (err, body) => {
            expect(err).to.equal(null);
            expect(body).to.deep.equal({ _id: "abc" });
            client.use("managed_devices").get("missing", (err2) => {
                expect(err2.statusCode).to.equal(404);
                expect(err2.error).to.equal("not_found");
                expect(err2.reason).to.equal("missing");
                client.scope("managed_builds").atomic("d", "n", "id", { a: 1 }, (err3, res) => {
                    expect(err3).to.equal(null);
                    expect(res).to.deep.equal({ design: "d", name: "n", id: "id", body: { a: 1 } });
                    done();
                });
            });
        });
    });

    it("keeps promise/await style working on wrapped scopes", async function () {
        const lib = client.db.use("managed_users");
        const body = await lib.atomic("users", "edit", "owner", { x: 1 });
        expect(body.id).to.equal("owner");
        let caught = null;
        try { await lib.get("missing"); } catch (e) { caught = e; }
        expect(caught.statusCode).to.equal(404);
    });

    it("routes synchronous throws to the callback instead of throwing", function (done) {
        client.db.use("managed_users").insert("boom", (err) => {
            expect(err).to.be.instanceOf(Error);
            expect(err.message).to.equal("sync boom");
            done();
        });
    });

    it("wraps attachment/multipart sub-objects and leaves streams and data alone", function (done) {
        const lib = client.db.use("managed_users");
        expect(lib.listAsStream()).to.equal("a-stream");
        expect(lib.config).to.deep.equal({ url: "http://couch:5984" });
        expect(client.config).to.deep.equal({ url: "http://couch:5984" });
        lib.attachment.get("doc", "file", (err, body) => {
            expect(err).to.equal(null);
            expect(body).to.equal("doc/file");
            lib.multipart.insert((err2, body2) => {
                expect(err2).to.equal(null);
                expect(body2).to.equal("mp");
                done();
            });
        });
    });

    it("JSON-parses string bodies like nano 10/axios did (callback path)", function (done) {
        const lib = client.db.use("managed_builds");
        lib.update("b1", (err, body) => {
            expect(err).to.equal(null);
            expect(body).to.be.a("object");
            expect(body).to.deep.equal({ _id: "b1", _rev: "2-x", ok: true });
            lib.plain((err2, body2) => {
                expect(err2).to.equal(null);
                expect(body2).to.equal("OK"); // non-JSON text stays a string
                done();
            });
        });
    });

    it("JSON-parses string bodies on the promise path too", async function () {
        const lib = client.db.use("managed_builds");
        const body = await lib.update("b2");
        expect(body).to.deep.equal({ _id: "b2", _rev: "2-x", ok: true });
        expect(await lib.plain()).to.equal("OK");
        expect(couch.parseBody(Buffer.from("x"))).to.be.instanceOf(Buffer);
        expect(couch.parseBody({ a: 1 })).to.deep.equal({ a: 1 });
    });

    it("exposes a real nano client through the default export", function () {
        const real = couch("http://user:pass@localhost:5984");
        expect(typeof real.db.list).to.equal("function");
        expect(typeof real.db.use).to.equal("function");
        const lib = real.db.use("managed_users");
        ["get", "insert", "destroy", "view", "list", "find", "bulk", "atomic", "fetch", "head"].forEach((m) => {
            expect(typeof lib[m]).to.equal("function", m);
        });
        expect(typeof lib.attachment.insert).to.equal("function");
    });
});
