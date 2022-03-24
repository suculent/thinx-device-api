var expect = require('chai').expect;
const Plugins = require('../../lib/thinx/plugins');
let config = __dirname + "/../../lib/thinx/plugins/plugins.json";

describe("Plugins", function () {

    // init
    it("should not fail", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(config);
    });

    
    it("should detect sample platform positively", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(config);
        
        let path = "../test_repositories/arduino";
        let result = manager.plugins['sample'].check(path);
        expect(result).to.equal('arduino');

        path = "../test_repositories/thinx-firmware-js";
        result = manager.plugins['sample'].check(path);
        expect(result).to.equal(false);
    });

});