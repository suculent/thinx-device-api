const expect = require('chai').expect;
const Builder = require("../../lib/thinx/builder");

// thinx-autoflood 3.0.3 was built with THINX_MQTT_URL "mosquitto" (the API's
// Docker-internal broker name) and never reached the broker after OTA.
describe("Builder broker address for firmware", function () {

    const config = (mqtt, api_url) => ({ api_url: api_url, mqtt: mqtt });

    describe("publicMqttHost", function () {

        it("never writes the Docker service name when api_url has a host", function () {
            expect(Builder.publicMqttHost(config({ server: "mqtt://mosquitto", port: 1883 }, "https://app.thinx.cloud"))).to.equal("app.thinx.cloud");
        });

        it("prefers mqtt.public_server", function () {
            expect(Builder.publicMqttHost(config({ server: "mqtt://mosquitto", public_server: "mqtts://thinx.cloud:8883/" }, "https://app.thinx.cloud"))).to.equal("thinx.cloud");
        });

        it("keeps a dotted mqtt.server", function () {
            expect(Builder.publicMqttHost(config({ server: "mqtt://broker.example.com" }, "https://app.thinx.cloud"))).to.equal("broker.example.com");
        });

        it("strips scheme, port and path from api_url", function () {
            expect(Builder.publicMqttHost(config({ server: "mqtt://mosquitto" }, "https://app.thinx.cloud:7443/api"))).to.equal("app.thinx.cloud");
        });

        it("falls back to the internal name only when nothing else is known", function () {
            expect(Builder.publicMqttHost(config({ server: "mqtt://localhost" }, ""))).to.equal("localhost");
            expect(Builder.publicMqttHost(config({ server: "mqtt://localhost" }, undefined))).to.equal("localhost");
        });

        it("ignores an empty or non-string public_server", function () {
            expect(Builder.publicMqttHost(config({ server: "mqtt://mosquitto", public_server: "" }, "https://app.thinx.cloud"))).to.equal("app.thinx.cloud");
            expect(Builder.publicMqttHost(config({ server: "mqtt://mosquitto", public_server: 42 }, "https://app.thinx.cloud"))).to.equal("app.thinx.cloud");
        });

        it("survives a missing mqtt section or config", function () {
            expect(Builder.publicMqttHost({ api_url: "https://app.thinx.cloud" })).to.equal("app.thinx.cloud");
            expect(Builder.publicMqttHost(null)).to.equal("");
        });
    });

    describe("publicMqttPort", function () {

        it("uses mqtt.port by default", function () {
            expect(Builder.publicMqttPort(config({ port: 1883 }))).to.equal(1883);
        });

        it("prefers a valid mqtt.public_port", function () {
            expect(Builder.publicMqttPort(config({ port: 1883, public_port: 8883 }))).to.equal(8883);
            expect(Builder.publicMqttPort(config({ port: 1883, public_port: "8883" }))).to.equal(8883);
        });

        it("ignores an invalid mqtt.public_port", function () {
            for (const bad of [0, -1, 70000, "abc", "", null, 1.5]) {
                expect(Builder.publicMqttPort(config({ port: 1883, public_port: bad })), String(bad)).to.equal(1883);
            }
        });
    });
});
