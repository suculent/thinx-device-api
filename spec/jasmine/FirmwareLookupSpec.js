/*
 * FirmwareLookupSpec — quick 261004-liv: the firmware lookup behind OTT redemption
 * (ott_update → Deployment#latestFirmwarePath → Plugins#extensions) iterates values,
 * not array indices.
 *
 * Runs without Redis and without CouchDB. Uses the real Plugins loader
 * (lib/thinx/plugins/plugins.json) and the real Deployment class; only
 * Filez.deployPathForDevice is pointed at a temporary deploy folder (jasmine spyOn,
 * restored automatically after each spec).
 *
 * Pinned behaviour:
 * - Plugins#extensions() answers the plugins' extension patterns ('*.bin', ...),
 *   de-duplicated, never array indices such as "0";
 * - Deployment#latestFirmwarePath finds firmware.bin in the device deploy folder, picks
 *   the newest matching file by mtime, and keeps the newest across all extensions
 *   (an older file of a later extension does not displace a newer .bin).
 *
 * Nothing here prints an owner id, key or token.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const fs = require("fs");
const os = require("os");
const path = require("path");
const expect = require("chai").expect;
const sha256 = require("sha256");

const Plugins = require("../../lib/thinx/plugins");
const Deployment = require("../../lib/thinx/deployment");
const Filez = require("../../lib/thinx/files");

const OWNER = sha256("liv-owner@example.com");
const UDID = "d1700000-0000-4000-8000-0000000000d1";

function lookup(deploy, owner, udid) {
    return new Promise((resolve) => deploy.latestFirmwarePath(owner, udid, resolve));
}

function writeAt(file, contents, secondsAgo) {
    fs.writeFileSync(file, contents);
    const when = new Date(Date.now() - (secondsAgo * 1000));
    fs.utimesSync(file, when, when);
}

describe("Firmware lookup (quick 261004-liv)", function () {

    describe("Plugins#extensions", function () {

        it("answers extension values from stub plugins, de-duplicated", function () {
            const manager = new Plugins();
            manager.plugins = {
                one: { extensions: () => ["*.bin"] },
                two: { extensions: () => ["*.bin", "*.elf"] },
                three: { extensions: () => null }
            };
            expect(manager.extensions()).to.deep.equal(["*.bin", "*.elf"]);
        });

        it("answers patterns, never indices, from the real plugin loader", async function () {
            const manager = new Plugins();
            await manager.loadFromConfig("./lib/thinx/plugins/plugins.json");
            const result = manager.extensions();
            expect(result).to.be.an("array");
            expect(result).to.include("*.bin");
            expect(result).to.not.include("0");
            for (const xt of result) {
                expect(xt.indexOf("*."), "pattern " + xt).to.equal(0);
            }
            expect(new Set(result).size, "de-duplicated").to.equal(result.length);
        });
    });

    describe("Deployment#latestFirmwarePath", function () {

        let root = null;
        let deploy = null;

        beforeEach(function () {
            root = fs.mkdtempSync(path.join(os.tmpdir(), "liv-deploy-"));
            fs.writeFileSync(path.join(root, "build.json"), JSON.stringify({ platform: "platformio", version: "thinx-autoflood:1.0" }));
            spyOn(Filez, "deployPathForDevice").and.returnValue(root);
            deploy = new Deployment();
        });

        afterEach(function () {
            fs.rmSync(root, { recursive: true, force: true });
        });

        it("finds firmware.bin next to build.json", async function () {
            writeAt(path.join(root, "firmware.bin"), Buffer.alloc(2048, 1), 0);
            writeAt(path.join(root, "notes.txt"), "not firmware", 0);
            const found = await lookup(deploy, OWNER, UDID);
            expect(found).to.equal(path.join(root, "firmware.bin"));
        });

        it("answers the newest .bin by mtime", async function () {
            writeAt(path.join(root, "a-new.bin"), Buffer.alloc(2048, 2), 10);
            writeAt(path.join(root, "z-old.bin"), Buffer.alloc(2048, 3), 3600);
            const found = await lookup(deploy, OWNER, UDID);
            expect(found).to.equal(path.join(root, "a-new.bin"));

            writeAt(path.join(root, "a-new.bin"), Buffer.alloc(2048, 2), 7200);
            const again = await lookup(deploy, OWNER, UDID);
            expect(again).to.equal(path.join(root, "z-old.bin"));
        });

        it("keeps the newest match across extensions", async function () {
            writeAt(path.join(root, "firmware.bin"), Buffer.alloc(2048, 4), 10);
            writeAt(path.join(root, "init.lua"), "-- older lua", 3600);
            writeAt(path.join(root, "boot.py"), "# older py", 3600);
            writeAt(path.join(root, "main.js"), "// older js", 3600);
            const found = await lookup(deploy, OWNER, UDID);
            expect(found).to.equal(path.join(root, "firmware.bin"));
        });

        it("answers false without build.json", async function () {
            fs.rmSync(path.join(root, "build.json"));
            writeAt(path.join(root, "firmware.bin"), Buffer.alloc(2048, 5), 0);
            const found = await lookup(deploy, OWNER, UDID);
            expect(found).to.equal(false);
        });

        it("answers false when no file matches", async function () {
            writeAt(path.join(root, "notes.txt"), "not firmware", 0);
            const found = await lookup(deploy, OWNER, UDID);
            expect(found).to.equal(false);
        });
    });
});
