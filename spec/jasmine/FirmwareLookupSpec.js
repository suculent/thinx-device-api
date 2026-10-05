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
 * - (Task 3) Deployment#fixAvailableVersion maps envelope versions "<name>:X.Y" and "X.Y"
 *   to X.Y.0, "<name>:X" and "X" to X.0.0, keeps collapsing 4-/5-part versions into the
 *   patch number, and answers undefined (no update) for anything else instead of throwing;
 *   Deployment#hasUpdateAvailable therefore offers thinx-autoflood:1.0 to a device on 0.1.0,
 *   compares versions only (the firmware name is ignored by operator decision), and never
 *   throws on a garbage envelope or device version.
 *
 * - (Task 3 deviation) now that the lookup finds files, OTT redemption reaches
 *   Device#updateFromPath for every platform. It fails closed instead of throwing: the
 *   multi-file branch (nodemcu/micropython/mongoose/nodejs → update_multiple, which reads a
 *   descriptor that does not exist) and an unreadable envelope answer callback(false) once,
 *   an unsupported platform answers instead of never calling back; and
 *   Deployment#supportedExtensions calls back exactly once even when the callback throws
 *   (it used to re-invoke it with [] from its .catch, and the second throw escaped as an
 *   unhandled rejection).
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
const Device = require("../../lib/thinx/device");

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

    // Task 3: the check-in FIRMWARE_UPDATE decision (Device#update_device_and_respond →
    // Deployment#hasUpdateAvailable → getAvailableVersion → fixAvailableVersion). Build
    // envelopes carry "<repo>:<git tag>"; a one-dot tag used to collapse to 0.X.Y and an
    // unprefixed one used to throw inside check-in.
    describe("Deployment#fixAvailableVersion", function () {

        const deploy = new Deployment();

        const cases = [
            ["thinx-autoflood:1.0", "1.0.0"],
            ["1.0", "1.0.0"],
            ["thinx-autoflood:1", "1.0.0"],
            ["1", "1.0.0"],
            ["thinx-autoflood:1.2.3", "1.2.3"],
            ["1.2.3", "1.2.3"],
            ["thinx-autoflood:v1.2", "1.2.0"],
            ["group:thinx-autoflood:2.1", "2.1.0"],
            ["thinx-autoflood:1.02", "1.2.0"],
            // 4- and 5-part versions keep collapsing their tail into the patch number;
            // longer ones keep their first three parts (unchanged behaviour)
            ["thinx-autoflood:1.2.3.4", "1.2.7"],
            ["thinx-autoflood:1.2.3.4.5", "1.2.12"],
            ["thinx-autoflood:1.2.3.4.5.6", "1.2.3"],
            [2, "2.0.0"],
            [1.5, "1.5.0"]
        ];

        for (const [input, expected] of cases) {
            it("maps " + JSON.stringify(input) + " to " + expected, function () {
                expect(deploy.fixAvailableVersion(input)).to.equal(expected);
            });
        }

        const garbage = ["", "thinx-autoflood:", "thinx-autoflood:abc", "abc", "1.x", "1.0-beta",
            "thinx-autoflood:1..2", "thinx-autoflood:1.2.3.4.x", null, undefined, {}, [], true, NaN];

        for (const input of garbage) {
            const label = Number.isNaN(input) ? "NaN" : String(JSON.stringify(input));
            it("answers undefined for " + label + " without throwing", function () {
                let result = "not called";
                expect(() => { result = deploy.fixAvailableVersion(input); }).to.not.throw();
                expect(result).to.equal(undefined);
            });
        }
    });

    describe("Device#updateFromPath fails closed", function () {

        let root = null;

        // updateFromPath only needs its two helpers; no Redis or CouchDB is touched.
        const ctx = {
            update_binary: Device.prototype.update_binary,
            update_multiple: Device.prototype.update_multiple
        };

        function serve(file) {
            return new Promise((resolve) => {
                const calls = [];
                let threw = null;
                try {
                    Device.prototype.updateFromPath.call(ctx, file, null, (...args) => calls.push(args));
                } catch (e) {
                    threw = e;
                }
                setTimeout(() => resolve({ calls, threw }), 50);
            });
        }

        function envelope(platform) {
            fs.writeFileSync(path.join(root, "build.json"), JSON.stringify({ platform: platform, version: "x:1.0" }));
        }

        beforeEach(function () {
            root = fs.mkdtempSync(path.join(os.tmpdir(), "liv-serve-"));
        });

        afterEach(function () {
            fs.rmSync(root, { recursive: true, force: true });
        });

        it("serves firmware.bin for platformio (unchanged)", async function () {
            envelope("platformio");
            fs.writeFileSync(path.join(root, "firmware.bin"), Buffer.alloc(4096, 7));
            const { calls, threw } = await serve(path.join(root, "firmware.bin"));
            expect(threw).to.equal(null);
            expect(calls.length, "callbacks").to.equal(1);
            expect(calls[0][0]).to.equal(true);
            expect(calls[0][1].filesize).to.equal(4096);
        });

        for (const platform of ["nodemcu", "micropython", "mongoose", "nodejs"]) {
            it("answers false once for multi-file platform " + platform, async function () {
                envelope(platform);
                fs.writeFileSync(path.join(root, "init.lua"), "print(1)");
                const { calls, threw } = await serve(path.join(root, "init.lua"));
                expect(threw, "thrown").to.equal(null);
                expect(calls.length, "callbacks").to.equal(1);
                expect(calls[0][0]).to.equal(false);
            });
        }

        it("answers false for an unsupported platform instead of never calling back", async function () {
            envelope("sigfox");
            fs.writeFileSync(path.join(root, "firmware.bin"), Buffer.alloc(4096, 7));
            const { calls, threw } = await serve(path.join(root, "firmware.bin"));
            expect(threw, "thrown").to.equal(null);
            expect(calls.length, "callbacks").to.equal(1);
            expect(calls[0][0]).to.equal(false);
        });

        it("answers false for an unreadable envelope", async function () {
            fs.writeFileSync(path.join(root, "build.json"), "not json");
            fs.writeFileSync(path.join(root, "firmware.bin"), Buffer.alloc(4096, 7));
            const { calls, threw } = await serve(path.join(root, "firmware.bin"));
            expect(threw, "thrown").to.equal(null);
            expect(calls.length, "callbacks").to.equal(1);
            expect(calls[0][0]).to.equal(false);
        });
    });

    describe("Deployment#supportedExtensions", function () {

        it("calls back exactly once, even when the callback throws", async function () {
            const deploy = new Deployment();
            const rejections = [];
            const recorder = (reason) => rejections.push(reason);
            process.on("unhandledRejection", recorder);
            try {
                const seen = [];
                deploy.supportedExtensions((extensions) => {
                    seen.push(extensions);
                    throw new Error("callback failure");
                });
                await new Promise((resolve) => setTimeout(resolve, 100));
                expect(seen.length, "callbacks").to.equal(1);
                expect(seen[0]).to.include("*.bin");
                expect(rejections.length, "unhandled rejections").to.equal(0);
            } finally {
                process.removeListener("unhandledRejection", recorder);
            }
        });
    });

    describe("Deployment#hasUpdateAvailable", function () {

        let root = null;
        let deploy = null;

        function envelope(version) {
            fs.writeFileSync(path.join(root, "build.json"), JSON.stringify({
                platform: "platformio", version: version, env_hash: "cafebabe"
            }));
        }

        function device(version) {
            return { owner: OWNER, udid: UDID, platform: "arduino:esp8266", version: version, auto_update: true };
        }

        beforeEach(function () {
            root = fs.mkdtempSync(path.join(os.tmpdir(), "liv-update-"));
            spyOn(Filez, "deployPathForDevice").and.returnValue(root);
            deploy = new Deployment();
        });

        afterEach(function () {
            fs.rmSync(root, { recursive: true, force: true });
        });

        it("offers thinx-autoflood:1.0 to a device on 0.1.0 (production af6eac20 case)", function () {
            envelope("thinx-autoflood:1.0");
            expect(deploy.hasUpdateAvailable(device("0.1.0"))).to.equal(true);
        });

        it("offers an unprefixed 1.0 envelope to a device on 0.1.0 without throwing", function () {
            envelope("1.0");
            expect(deploy.hasUpdateAvailable(device("0.1.0"))).to.equal(true);
        });

        it("ignores the firmware name: version compare only (operator decision 2026-10-04)", function () {
            envelope("some-other-firmware:0.2");
            expect(deploy.hasUpdateAvailable(device("0.1.0"))).to.equal(true);
        });

        it("does not offer the same or an older version", function () {
            envelope("thinx-autoflood:1.0");
            expect(deploy.hasUpdateAvailable(device("1.0"))).to.equal(false);
            expect(deploy.hasUpdateAvailable(device("1.0.0"))).to.equal(false);
            expect(deploy.hasUpdateAvailable(device("2.0.0"))).to.equal(false);
        });

        it("answers false for a garbage envelope version without throwing", function () {
            envelope("thinx-autoflood:latest");
            let result = "not called";
            expect(() => { result = deploy.hasUpdateAvailable(device("0.1.0")); }).to.not.throw();
            expect(result).to.equal(false);
        });

        it("answers false for a garbage device version without throwing", function () {
            envelope("thinx-autoflood:1.0");
            for (const version of ["abc", "", 7, "1.x"]) {
                let result = "not called";
                expect(() => { result = deploy.hasUpdateAvailable(device(version)); }, "device " + JSON.stringify(version)).to.not.throw();
                expect(result, "device " + JSON.stringify(version)).to.equal(false);
            }
        });

        it("answers false when the device has no build envelope", function () {
            expect(deploy.hasUpdateAvailable(device("0.1.0"))).to.equal(false);
        });
    });
});
