var expect = require('chai').expect;
const Plugins = require('../../lib/thinx/plugins');
let config = __dirname + "/../../lib/thinx/plugins/plugins.json";
let empty = __dirname + "/../empty.json";

describe("Plugins", function () {

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
        
        let path = "../test_repositories/arduino";
        let result = manager.plugins['sample'].check(path);
        expect(result).to.equal('sample');

        path = "../test_repositories/thinx-firmware-js";
        result = manager.plugins['sample'].check(path);
        expect(result).to.equal(false);
    });

    
    it("should be able to use all plugins at once", async function () {
        let manager = new Plugins(this);
        await manager.loadFromConfig(config);
        
        let path = "../test_repositories/arduino";
        let result = await manager.use(path);
        expect(result).to.equal('sample');
    });

});