/* Shared THiNX bootstrap — initialises one server instance for all ZZ-* specs */

const THiNX = require("../../thinx-core.js");

const state = { thx: null };

beforeAll((done) => {
    state.thx = new THiNX();
    state.thx.init(() => {
        done();
    });
}, 60000);

afterAll((done) => {
    if (state.thx && state.thx.server) {
        state.thx.server.close();
    }
    done();
});

module.exports = state;
