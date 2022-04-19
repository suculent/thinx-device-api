const InfluxConnector = require('../../lib/thinx/influx');

describe("InfluxDB", function () {

    /*

    static get_owner_template() {
        // Defines data model and also lists known tracked keys
        return {
            APIKEY_INVALID: [0],
            LOGIN_INVALID: [0],
            APIKEY_MISUSE: [0],
            APIKEY_REVOKED: [0],
            DEVICE_NEW: [0],
            DEVICE_CHECKIN: [0],
            DEVICE_UPDATE_OK: [0], // TODO (22): not implemented
            DEVICE_UPDATE_FAIL: [0], // TODO (22): not implemented
            DEVICE_REVOCATION: [0],
            BUILD_STARTED: [0],
            BUILD_SUCCESS: [0],
            BUILD_FAIL: [0]
        };
    }

    */

    it("(3) should work as class with specific db", function (done) {

        InfluxConnector.createDB('stats', () => {

            let influx = new InfluxConnector('stats');

            let point = {
                measurement: 'CHECKIN',
                tags: { owner_id: "test", udid: "udid" },
                fields: { value: 1 },
            }

            influx.writePoint(point, (result) => {
                console.log("InfluxDB result (3)", JSON.stringify(result, null, 2));
                done();
            });

        });
    });

    it("(4) should be able to create users", function (done) {
        InfluxConnector.createUser('test', 'test', () => {
            done();
        }, true);
    });
});
