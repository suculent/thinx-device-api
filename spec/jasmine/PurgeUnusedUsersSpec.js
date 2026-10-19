"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { classifyUser, parseArgs, run, connection } = require("../../scripts/purge-unused-users");
const { spawnSync } = require("node:child_process");

const user = (letter, extra = {}) => ({
    _id: letter.repeat(64), owner: letter.repeat(64), _rev: "1-original",
    username: "fixture", activation: "pending", ...extra
});

// Model revision conflicts and cursor paging, including deletion of the cursor.
function database(docs) {
    const records = new Map(docs.map(doc => [doc._id, structuredClone(doc)]));
    return {
        records, deleted: [],
        async list(options) {
            const rows = [...records.values()].sort((a, b) => a._id.localeCompare(b._id))
                .filter(doc => !options.startkey || doc._id >= options.startkey)
                .slice(0, options.limit).map(doc => ({ id: doc._id, doc: structuredClone(doc) }));
            return { rows };
        },
        async get(id) {
            if (!records.has(id)) throw { statusCode: 404 };
            return structuredClone(records.get(id));
        },
        async find({ selector }) {
            return { docs: [...records.values()].filter(doc => doc.owner === selector.owner.$eq).slice(0, 1) };
        },
        async destroy(id, rev) {
            if (records.get(id)?._rev !== rev) throw { statusCode: 409 };
            this.deleted.push(id);
            records.delete(id);
            return { ok: true, id, rev: "2-deleted" };
        }
    };
}

describe("purge-unused-users", function () {
    let dir, snapshot;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-unused-users-"));
        snapshot = path.join(dir, "snapshot.jsonl");
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it("selects only users with absent login markers, preserving ambiguous values", () => {
        assert.equal(classifyUser(user("a")), "candidate");
        assert.equal(classifyUser(user("a", { activation: null, password: "hash" })), "candidate");
        for (const field of ["last_seen", "last_login"]) {
            for (const value of ["2020-01-01", null, "", false, 0, {}]) {
                assert.equal(classifyUser(user("a", { [field]: value })), "login_marker");
            }
        }
    });

    it("preserves admins, OAuth accounts, conflicts and malformed identities", () => {
        for (const extra of [{ admin: true }, { activation: false }, { gitHubAccessToken: "redacted" },
            { _conflicts: ["2-other"] }, { _attachments: { avatar: { stub: true } } },
            { owner: "other" }, { _id: "_design/users" }, { _rev: null }]) {
            assert.notEqual(classifyUser(user("a", extra)), "candidate");
        }
    });

    it("defaults to scan and rejects unsafe or misspelled arguments", () => {
        assert.equal(parseArgs([]).apply, false);
        assert.equal(parseArgs(["--dry-run"]).apply, false);
        for (const args of [["--aply"], ["--apply"], ["--apply", "--scan"],
            ["--snapshot-to"], ["--batch-size", "0"], ["--batch-size", "2x"]]) {
            assert.throws(() => parseArgs(args));
        }
    });

    it("uses the selected prefix and safely encodes secret credentials", () => {
        const secrets = { COUCHDB_USER: "admin@example", COUCHDB_PASS: "p@ss:/?#" };
        const config = connection({ THINX_PREFIX: "test_" }, name => secrets[name]);
        const url = new URL(config.url);
        assert.equal(decodeURIComponent(url.username), secrets.COUCHDB_USER);
        assert.equal(decodeURIComponent(url.password), secrets.COUCHDB_PASS);
        assert.equal(config.prefix, "test_");
        assert.equal(url.hostname, "couchdb");
        assert.throws(() => connection({}, () => null));
        assert.throws(() => connection({ THINX_PREFIX: "../../" }, name => secrets[name]));
        assert.throws(() => connection({ COUCHDB_URL: "file:///tmp/couch" }, name => secrets[name]));
    });

    it("offers help and rejects unsafe apply before any connection, without leaking input", () => {
        const script = path.resolve(__dirname, "../../scripts/purge-unused-users.js");
        for (const [args, status] of [[["--help"], 0], [["--apply"], 2], [["--typo=secret-value"], 2]]) {
            const result = spawnSync(process.execPath, [script, ...args], {
                encoding: "utf8", env: { ...process.env, COUCHDB_URL: "secret-value" }
            });
            assert.equal(result.status, status);
            assert.ok(!(result.stdout + result.stderr).includes("secret-value"));
        }
    });

    it("checks real device documents, pages all users and never writes in scan mode", async () => {
        const users = database([user("a"), user("b"), user("c", { last_seen: "2020" }), user("d")]);
        const devices = database([{ _id: "device", owner: user("b").owner }]);
        const result = await run({ users, devices }, { batchSize: 2 });
        assert.equal(result.candidates, 2);
        assert.equal(result.retained.devices, 1);
        assert.deepEqual(users.deleted, []);
        assert.equal(fs.existsSync(snapshot), false);
    });

    it("backs up every selected document privately before deleting, and is repeatable", async () => {
        const users = database([user("a"), user("b"), user("c"), user("d")]);
        const devices = database([]);
        const originalDestroy = users.destroy.bind(users);
        users.destroy = async (...args) => {
            const backup = fs.readFileSync(snapshot, "utf8").trim().split("\n").map(JSON.parse);
            assert.equal(backup.length, 4);
            assert.equal(fs.statSync(snapshot).mode & 0o777, 0o600);
            assert.ok(backup.some(doc => doc._id === args[0] && doc._rev === args[1]));
            return originalDestroy(...args);
        };
        const result = await run({ users, devices }, { apply: true, snapshotTo: snapshot, batchSize: 2 });
        assert.equal(result.deleted, 4);
        assert.equal((await run({ users, devices }, {})).candidates, 0);
    });

    it("does not drop the next page when the preceding cursor document disappears", async () => {
        const users = database([user("a"), user("b"), user("c"), user("d")]);
        const list = users.list.bind(users);
        users.list = async options => {
            if (options.startkey) users.records.delete(options.startkey);
            return list(options);
        };
        assert.equal((await run({ users, devices: database([]) }, { batchSize: 2 })).candidates, 4);
    });

    it("rechecks logins, devices and revisions before deletion", async () => {
        const users = database([user("a"), user("b"), user("c")]);
        const devices = database([]);
        const get = users.get.bind(users);
        users.get = async id => {
            if (id === user("a")._id) return user("a", { _rev: "2-login", last_seen: "now" });
            if (id === user("c")._id) return user("c", { _rev: "2-edited" });
            return get(id);
        };
        devices.find = async () => ({ docs: [{ _id: "new-device", owner: user("b").owner }] });
        const result = await run({ users, devices }, { apply: true, snapshotTo: snapshot });
        assert.equal(result.changed, 3);
        assert.deepEqual(users.deleted, []);
    });

    it("does not retry deletion after a concurrent user update", async () => {
        const users = database([user("a")]);
        users.destroy = async () => { throw { statusCode: 409 }; };
        const result = await run({ users, devices: database([]) }, { apply: true, snapshotTo: snapshot });
        assert.equal(result.conflicts, 1);
        assert.equal(result.deleted, 0);
    });

    it("fails closed on unreadable or malformed devices, including a later page", async () => {
        for (const brokenList of [async () => { throw new Error("unavailable"); }, async () => ({}),
            async () => ({ rows: [{ id: "device" }] }),
            async options => options.startkey ? Promise.reject(new Error("later page")) :
                ({ rows: [{ id: "device", doc: { _id: "device", owner: "other" } }] })]) {
            const users = database([user("a")]);
            const devices = database([]);
            devices.list = brokenList;
            await assert.rejects(run({ users, devices }, { apply: true, snapshotTo: snapshot, batchSize: 1 }));
            assert.deepEqual(users.deleted, []);
        }
    });

    it("aborts when the final device check fails or is malformed", async () => {
        for (const find of [async () => { throw new Error("unavailable"); }, async () => ({})]) {
            const users = database([user("a")]);
            const devices = database([]);
            devices.find = find;
            await assert.rejects(run({ users, devices }, { apply: true, snapshotTo: path.join(dir, Math.random() + ".jsonl") }));
            assert.deepEqual(users.deleted, []);
        }
    });

    it("aborts on conflicted devices that may conceal ownership in another leaf", async () => {
        const users = database([user("a")]);
        const devices = database([{ _id: "device", owner: user("b").owner, _conflicts: ["2-owner-a"] }]);
        await assert.rejects(run({ users, devices }, { apply: true, snapshotTo: snapshot }));
        assert.deepEqual(users.deleted, []);
        assert.equal(fs.existsSync(snapshot), false);
    });

    it("refuses to overwrite a snapshot or delete without one", async () => {
        const users = database([user("a")]);
        fs.writeFileSync(snapshot, "existing");
        for (const snapshotTo of [undefined, snapshot, path.join(dir, "absent", "backup")]) {
            await assert.rejects(run({ users, devices: database([]) }, { apply: true, snapshotTo }));
            assert.deepEqual(users.deleted, []);
        }
        assert.equal(fs.readFileSync(snapshot, "utf8"), "existing");
    });
});
