/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

//var envi = require("../_envi.json");

let thx;

describe("RSA Keys (noauth)", function () {

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("GET /api/user/rsakey/create", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/create')
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/rsakey/create response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /api/user/rsakey/list", function (done) {
        console.log("🚸 [chai] request /api/user/rsakey/list");
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/rsakey/list response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .send()
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/rsakey/revoke (noauth, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

});

describe("RSA Keys (JWT)", function () {

    let agent;
    let jwt;
  
    beforeAll((done) => {
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .then(function (res) {
                // console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
                expect(res).to.have.cookie('x-thx-core');
                let body = JSON.parse(res.text);
                jwt = 'Bearer ' + body.access_token;
                done();
            })
            .catch((e) => { console.log(e); });
    });
  
    afterAll((done) => {
        agent.close();
        done();
    });

    let key_id = null;

    it("GET /api/user/rsakey/create", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/create')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/rsakey/create response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /api/user/rsakey/list", function (done) {
        console.log("🚸 [chai] request /api/user/rsakey/list");
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/rsakey/list response:", res.text, " status:", res.status);
                /*
                { "success":true,
                    "rsa_keys":[
                        {"name":"Sat Apr 02 2022 20:07:10 GMT+0000 (Coordinated Universal Time)","fingerprint":"8f0ab4484f32679c6e2de0f43f30a0894a4375adb553af3ebce0a2fb52a29f9c","date":"Sat Apr 02 2022 20:07:10 GMT+0000 (Coordinated Universal Time)","pubkey":"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDQPvs2ImZiNqzGDIrVO9m49iKO4ixIm+NHH79za+rF3emsOUfJq71yLaE4qWxs/g6yfqY+4baUTzI6UZOpHyxcGBZGivBWpxbSsUYoahU+SPrJPwYvwQcSzTaTgOwkQUCa3qI2xwfnXrvn5B8cW9PhUGVVdJKUktXhevAFrd4M4aaddWBkKh0EFXvlI3CCWPTAjg3LlyeF1xbZF/QVvFZ1QH2KzM9Vxp8Gs0pVS+FRw3AIlApwE1ZTHgQ4fnOuhAR5tXO+9bXTuE20O5fUO7VNipohfcTEZlj/VQiHRC7fbaF2QWsR0HRKaVquzYaGTzg3LZDZ6KFU3cj2Pv3CPo8f3bt0VjWXcsyzYCNIU3h0n8XpeCMkCh9m/U4CPLlB+nLYnql8aOxd2vMKeqGxNuJuKctWHt9wxu9eRXimId8ge/X4kcBLDxCzYIlzpM+Xt5JjHPm+AuaWGTxJJOJHwTbsUzsaubVuMqyD1nbSsgtP5pBZq8dGI1q/bk3KbwtlgVE= bab692f8c9c78cf64f579406bdf6c6cd2c4d00b3c0c8390387d051495dd95247@***************\n","filename":"bab692f8c9c78cf64f579406bdf6c6cd2c4d00b3c0c8390387d051495dd95247-1648930030486"}
                    ]}*/
                let r = JSON.parse(res.text);
                expect(r.success).to.equal(true);
                key_id = r.rsa_keys[0].filename;
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (jwt, undefined)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send()
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/rsakey/revoke (jwt, undefined) response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"invalid_query"}');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (valid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send({ filenames: [key_id]})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/rsakey/revoke (valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});