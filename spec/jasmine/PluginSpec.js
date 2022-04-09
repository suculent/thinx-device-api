var expect = require('chai').expect;
const Plugins = require('../../lib/thinx/plugins');
let config = __dirname + "/../../lib/thinx/plugins/plugins.json";
let empty = __dirname + "/../empty.json";

describe("Plugins", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] running Plugin spec`);
      });
    
      afterAll(() => {
        console.log(`🚸 [chai] completed Plugin spec`);
      });

    it("should not fail", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(config);
    });

    it("should fail safely", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(empty);
    });
    
    it("should detect sample platform positively", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(config);
        
        let path = "./spec/test_repositories/thinx-firmware-js";
        let result = manager.plugins.arduino.check(path);
        expect(result).to.equal(false);
    });
    
    it("should be able to use all plugins at once", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(config);
        
        let path = "./spec/test_repositories/arduino";
        let result = await manager.use(path);
        expect(result).to.equal('arduino');

        path = "./spec/test_repositories/thinx-firmware-esp8266-pio";
        result = await manager.use(path);
        expect(result).to.equal('platformio');

        path = "./spec/test_repositories/thinx-firmware-esp8266-pio";
        result = await manager.use(path);
        expect(result).to.equal('platformio');

        path = "./spec/test_repositories/thinx-firmware-esp8266-upy";
        result = await manager.use(path);
        expect(result).to.equal('python');

        path = "./spec/test_repositories/thinx-firmware-esp8266-mos";
        result = await manager.use(path);
        expect(result).to.equal('mongoose');

        path = "./spec/test_repositories/thinx-firmware-js";
        result = await manager.use(path);
        expect(result).to.equal('nodejs');

        path = "./spec/test_repositories/thinx-firmware-esp8266-lua";
        result = await manager.use(path);
        expect(result).to.equal('nodemcu');
    });

    it("should be able to aggregate all supported extensions", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(config);
        let result = manager.extensions();
        expect(result).to.be.an('array');
    });

});