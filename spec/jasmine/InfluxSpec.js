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

    it("should track owner event APIKEY_INVALID", function (done) {

        let point = {
            measurement: 'APIKEY_INVALID',
            tags: { owner_id: owner },
            fields: { value: 1 },
        }

        influx.writePoint(point, (result) => {
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
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
            expect(result.length > 0);
            done();
        });
    });

    ///


    it("should query APIKEY_INVALID", function (done) {
        influx.query('APIKEY_INVALID', (result) => {
            console.log("InfluxDB result APIKEY_INVALID:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });

    it("should query LOGIN_INVALID", function (done) {
        influx.query('LOGIN_INVALID', (result) => {
            console.log("InfluxDB result CHECKIN:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });

    it("should query APIKEY_MISUSE", function (done) {
        influx.query('APIKEY_MISUSE', (result) => {
            console.log("InfluxDB result APIKEY_MISUSE:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });

    it("should query APIKEY_REVOKED", function (done) {
        influx.query('APIKEY_REVOKED', (result) => {
            console.log("InfluxDB result APIKEY_REVOKED:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });


    it("should query DEVICE_NEW", function (done) {
        influx.query('DEVICE_NEW', (result) => {
            console.log("InfluxDB result DEVICE_NEW:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });

    it("should query DEVICE_CHECKIN", function (done) {
        influx.query('DEVICE_CHECKIN', (result) => {
            console.log("InfluxDB result DEVICE_CHECKIN:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });

    it("should query DEVICE_REVOCATION", function (done) {
        influx.query('DEVICE_REVOCATION', (result) => {
            console.log("InfluxDB result DEVICE_REVOCATION:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });


    it("should query BUILD_STARTED", function (done) {
        influx.query('BUILD_STARTED', (result) => {
            console.log("InfluxDB result BUILD_STARTED:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });


    it("should query BUILD_SUCCESS", function (done) {
        influx.query('BUILD_SUCCESS', (result) => {
            console.log("InfluxDB result BUILD_SUCCESS:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });


    it("should query BUILD_FAIL", function (done) {
        influx.query('BUILD_FAIL', (result) => {
            console.log("InfluxDB result BUILD_FAIL:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });

    it("should query owner", function (done) {
        influx.queryOwner('BUILD_FAIL', owner, (result) => {
            console.log("InfluxDB result BUILD_FAIL with:", JSON.stringify(result, null, 2));
            expect(result.length > 0);
            done();
        });
    });
    

});
