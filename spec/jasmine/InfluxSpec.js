const InfluxConnector = require('../../lib/thinx/influx');
const envi = require("../_envi.json");
const owner = envi.oid;
const udid = envi.udid;

describe("InfluxDB", function () {

    let influx;

    beforeAll((done) => {
        InfluxConnector.createDB('stats', () => {
            influx = new InfluxConnector('stats');
            done();
        });
    });

    it("static should create user", function (done) {
        InfluxConnector.createUser('test', 'test', () => {
            done();
        }, true);
    });

    it("should track device checkins", function (done) {

        let point = {
            measurement: 'CHECKIN',
            tags: { owner_id: owner, udid: udid },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result (3)", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event APIKEY_INVALID", function (done) {

        let point = {
            measurement: 'APIKEY_INVALID',
            tags: { owner_id: owner },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event LOGIN_INVALID", function (done) {

        let point = {
            measurement: 'LOGIN_INVALID',
            tags: { owner_id: owner },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event APIKEY_MISUSE", function (done) {

        let point = {
            measurement: 'APIKEY_MISUSE',
            tags: { owner_id: owner, hash: "keyhash" },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event APIKEY_REVOKED", function (done) {

        let point = {
            measurement: 'APIKEY_REVOKED',
            tags: { owner_id: owner, hash: "keyhash" },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event DEVICE_NEW", function (done) {

        let point = {
            measurement: 'DEVICE_NEW',
            tags: { owner_id: owner, udid: udid },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event DEVICE_CHECKIN", function (done) {

        let point = {
            measurement: 'DEVICE_CHECKIN',
            tags: { owner_id: owner, udid: udid },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event DEVICE_REVOCATION", function (done) {

        let point = {
            measurement: 'DEVICE_REVOCATION',
            tags: { owner_id: owner, udid: udid },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event BUILD_STARTED", function (done) {

        let point = {
            measurement: 'BUILD_STARTED',
            tags: { owner_id: owner, build_id: "build_id" },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event BUILD_SUCCESS", function (done) {

        let point = {
            measurement: 'BUILD_SUCCESS',
            tags: { owner_id: owner, build_id: "build_id" },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });

    it("should track owner event BUILD_FAIL", function (done) {

        let point = {
            measurement: 'BUILD_FAIL',
            tags: { owner_id: owner, build_id: "build_id" },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            console.log("InfluxDB result:", JSON.stringify(result, null, 2));
            done();
        });
    });
    

});
