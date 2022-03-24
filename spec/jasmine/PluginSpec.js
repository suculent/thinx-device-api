var expect = require('chai').expect;
const Plugins = require('../../lib/thinx/plugins');

describe("Plugins", function () {

    // init
    it("should not fail", async function (done) {
        let plugins = new Plugins();
        await plugins.load();
        done();
    });

    it("should detect sample platform positively", async function (done) {
        let plugins = new Plugins();
        await plugins.load();
        let platform = 'sample';
        let result = plugins.plugins[platform].check(path);
        console.log(result);
        expect(result).to.be.a('string');
        done();
    });

});