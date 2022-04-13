/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
let chaiHttp = require('chai-http');
var expect = require('chai').expect;
chai.use(chaiHttp);

var envi = require("../_envi.json");

let thx;

describe("Meshes (noauth)", function () {

    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Meshes (noauth) spec`);
        thx = new THiNX();
        thx.init(() => {
            console.log("🚸 [chai] Initialized Meshes (noauth)...");
            done();
        });
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed Meshes (noauth) spec`);
    });

    // GET /api/mesh/list [cookie auth]
    it("GET /api/mesh/list (noauth)", function (done) {
        chai.request(thx.app)
            .get('/api/mesh/list')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/list (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/list')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/list (APIKey, semi-valid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/list')
            .send({ owner_id: "mock-owner-id", apikey: "mock-api-key", alias: "mock-mesh-alias" })
            .end((err, res) => {
                expect(res.status).to.equal(401); 
                done();
            });
    }, 20000);

    it("POST /api/mesh/list (APIKey, semi-valid 2)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/list')
            .send({ owner_id: envi.oid, apikey: "mock-api-key", alias: "mock-mesh-alias" })
            .end((err, res) => {
                expect(res.status).to.equal(401); 
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/create')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/create')
            .send({ owner_id: envi.dynamic.owner })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (noauth, semi-valid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/create')
            .send({ alias: "mock-mesh-alias" })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (noauth, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/create')
            .send({ alias: "mock-mesh-alias", owner_id: envi.dynamic.owner })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/delete')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (noauth, null)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/delete')
            .send('{meshid:null}')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (noauth, undefined)", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/delete')
            .send('{"meshid":undefined}')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);
});

describe("Meshes (JWT)", function () {

    let agent;
    let jwt;

    let mesh_id = null;
  
    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Meshes (JWT) spec`);
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .then(function (res) {
                let body = JSON.parse(res.text);
                jwt = 'Bearer ' + body.access_token;
                console.log("🚸 [chai] Initialized Meshes (JWT)...");
                done();
            })
            .catch((e) => { console.log(e); });
    });
  
    afterAll((done) => {
        agent.close();
        console.log(`🚸 [chai] <<< completed Meshes (JWT) spec`);
        done();
    });

    it("GET /api/mesh/list (jwt, valid)", function (done) {
        agent
            .get('/api/mesh/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                //expect(res.text).to.equal('{"success":true,"mesh_ids":[{"mesh_id":"device-mesh-id","alias":"device-mesh-alias"}]}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/list (jwt, invalid)", function (done) {
        agent
            .post('/api/mesh/list')
            .set('Authorization', jwt)
            .send({ owner_id: "mock-owner-id", apikey: "mock-api-key", alias: "mock-mesh-alias" })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"reason":"OWNER_INVALID"}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (jwt, semi-valid)", function (done) {
        agent
            .post('/api/mesh/create')
            .set('Authorization', jwt)
            .send({ alias: "mock-mesh-alias" })
            .end((err, res) => {
                let r = JSON.parse(res.text);
                mesh_id = r.mesh_id;
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"Owner ID missing in request body."}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (jwt, semi-valid)", function (done) {
        agent
            .post('/api/mesh/create')
            .set('Authorization', jwt)
            .send({ alias: "mock-mesh-alias", owner_id: envi.dynamic.owner })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"Mesh ID missing in request body."}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (jwt, valid)", function (done) {
        agent
            .post('/api/mesh/create')
            .set('Authorization', jwt)
            .send({ alias: "mock-mesh-alias", owner_id: envi.dynamic.owner, mesh_id: 'mock-mesh-id' })
            .end((err, res) => {
                let r = JSON.parse(res.text);
                mesh_id = r.mesh_id;
                //expect(r.mesh_id).to.exist;
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":true,"mesh_ids":{"mesh_id":"mock-mesh-id","alias":"mock-mesh-alias"}}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create (jwt, valid, already exists)", function (done) {
        agent
            .post('/api/mesh/create')
            .set('Authorization', jwt)
            .send({ alias: "mock-mesh-alias", owner_id: envi.dynamic.owner, mesh_id: 'mock-mesh-id' })
            .end((err, res) => {
                //console.log("🚸 [chai] POST /api/mesh/create (jwt, valid, already exists) response:", res.text, " status:", res.status);
                let r = JSON.parse(res.text);
                mesh_id = r.mesh_ids.mesh_id;
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":true,"mesh_ids":{"mesh_id":"mock-mesh-id","alias":"mock-mesh-alias"}}');                
                done();
            });
    }, 20000);

    // does not guard against already existing!
    it("POST /api/mesh/create (jwt, valid 2)", function (done) {
        agent
            .post('/api/mesh/create')
            .set('Authorization', jwt)
            .send({ alias: "mock-mesh-alias-2", owner_id: envi.dynamic.owner, mesh_id: 'mock-mesh-id-2' })
            .end((err, res) => {
                let r = JSON.parse(res.text);
                mesh_id = r.mesh_ids.mesh_id;
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":true,"mesh_ids":{"mesh_id":"mock-mesh-id-2","alias":"mock-mesh-alias-2"}}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, invalid)", function (done) {
        agent
            .post('/api/mesh/delete')
            .set('Authorization', jwt)
            .send('{meshid:null}')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, semi-valid)", function (done) {
        expect(mesh_id !== null);
        agent
            .post('/api/mesh/delete')
            .set('Authorization', jwt)
            .send('{"mesh_ids":"'+mesh_id+'"}')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"Parameter owner_id missing."}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, invalid)", function (done) {
        expect(mesh_id !== null);
        let ro = {
            mesh_ids: [mesh_id],
            owner_id: envi.dynamic.owner
        };
        agent
            .post('/api/mesh/delete')
            .set('Authorization', jwt)
            .send(JSON.stringify(ro))
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/delete (jwt, invalid) response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                // {"success":false,"status":"Parameter owner_id missing."}
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, invalid, already deleted)", function (done) {
        expect(mesh_id !== null);
        let ro = {
            mesh_ids: [mesh_id],
            owner_id: envi.dynamic.owner
        };
        agent
            .post('/api/mesh/delete')
            .set('Authorization', jwt)
            .send(JSON.stringify(ro))
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/mesh/delete (jwt, already deleted) response:", res.text, " status:", res.status, "request:", ro);
                expect(res.status).to.equal(200);
                //expect(res.text).to.equal();
                //{"success":false,"status":"Parameter owner_id missing."}
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, valid)", function (done) {
        expect(mesh_id !== null);
        let ro = {
            mesh_ids: [mesh_id],
            owner_id: envi.dynamic.owner
        };
        agent
            .post('/api/mesh/delete')
            .set('Authorization', jwt)
            .send(ro)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":true,"status":["mock-mesh-id-2"]}');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete (jwt, already deleted)", function (done) {
        expect(mesh_id !== null);
        let ro = {
            mesh_ids: [mesh_id],
            owner_id: envi.dynamic.owner
        };
        agent
            .post('/api/mesh/delete')
            .set('Authorization', jwt)
            .send(ro)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":[]}');
                
                done();
            });
    }, 20000);
});