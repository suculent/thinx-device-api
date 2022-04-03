/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;

describe("Meshes (noauth)", function () {

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    // GET /api/mesh/list [cookie auth]
    it("GET /api/mesh/list (noauth)", function (done) {
        chai.request(thx.app)
            .get('/api/mesh/list')
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/mesh/list (noauth) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/list (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/list')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/list (noauth, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/list (noauth, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/list')
            .send({ owner_id: "mock-owner-id", apikey: "mock-api-key", alias: "mock-mesh-alias" })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/list (noauth, valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/create')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/create (noauth, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (noauth, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/create')
            .send({ alias: "mock-mesh-alias" })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/create (noauth, valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/delete')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/delete (noauth, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (noauth, null)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/delete')
            .send('{meshid:null}')
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/delete (noauth, null) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (noauth, undefined)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/delete')
            .send('{"meshid":undefined}')
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/delete (noauth, null) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});

describe("Meshes (JWT)", function () {

    let agent;
    let jwt;

    let mesh_id = null;
  
    beforeAll((done) => {
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .then(function (res) {
                // console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
                let body = JSON.parse(res.text);
                jwt = 'Bearer ' + body.access_token;
                done();
            });
    });
  
    afterAll((done) => {
        agent.close();
        done();
    });

    // GET /api/mesh/list [cookie auth]
    it("GET /api/mesh/list (jwt, invalid)", function (done) {
        agent
            .get('/api/mesh/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/mesh/list (jwt, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/list (jwt, invalid)", function (done) {
        agent
            .post('/api/mesh/list')
            .set('Authorization', jwt)
            .send({ owner_id: "mock-owner-id", apikey: "mock-api-key", alias: "mock-mesh-alias" })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/list (jwt, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (jwt, valid)", function (done) {
        agent
            .post('/api/mesh/create')
            .set('Authorization', jwt)
            .send({ alias: "mock-mesh-alias" })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/create (jwt, valid) response:", res.text, " status:", res.status);
                let r = JSON.parse(res.text);
                mesh_id = r.mesh_id;
                /// mesh_id = ...
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, invalid)", function (done) {
        agent
            .post('/api/mesh/delete')
            .send('{meshid:null}')
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/delete (jwt, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, valid)", function (done) {
        expect(mesh_id !== null);
        agent
            .post('/api/mesh/delete')
            .send('{"meshid":"'+mesh_id+'"}')
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/delete (jwt, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});