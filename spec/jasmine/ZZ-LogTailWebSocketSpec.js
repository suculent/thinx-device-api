/* WebSocket log tail owner binding against the in-process THiNX server
 * (quick 261003-v05).
 *
 * Needs Redis and CouchDB (bootstrap thinx-core): it logs in as `dynamic` and
 * uses the real x-thx-core session cookie at upgrade. The local half of this
 * coverage is LogTailOwnerSpec.js, which runs without either.
 *
 * File name: it must sort after ZZ-AppSessionUserSpec (which activates
 * `dynamic`) and before ZZ-RouterTransformerSpec, whose last action deletes
 * `dynamic`. "ZZ-LogTail..." sorts before every "ZZ-Router..." spec.
 *
 * NOTE: docker-entrypoint.sh deletes every ZZ-* spec except
 * ZZ-LogPagingCouchSpec before the CI test run, so this file does not run in CI
 * today; it runs with the ZZ tier once that is re-enabled.
 *
 * Never prints the cookie or a raw frame.
 */

// IMPORTANT: keep the bootstrap require at top level (see the note in
// ZZ-WebSocketHandshakeRtmSpec.js): its beforeAll is registered at require time.
const bootstrap = require('../helpers/bootstrap');
const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const WebSocket = require('ws');
const envi = require('../_envi.json');
const LOGTAIL_NOT_FOUND = require("../../lib/thinx/buildlog").LOGTAIL_NOT_FOUND;

let thx;
let cookie = null;
let openSockets = [];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

describe("WebSocket log tail owner binding (quick 261003-v05)", function () {

  beforeAll((done) => {
    console.log("🚸 [chai] >>> running WebSocket log tail owner binding spec");
    thx = bootstrap.thx;
    chai.request(thx.app)
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        const setCookie = res.headers['set-cookie'] || [];
        const entry = setCookie.find((c) => /^x-thx-core=/.test(c));
        if (typeof entry !== "string") {
          done.fail("dynamic login yielded no x-thx-core cookie");
          return;
        }
        cookie = entry.split(";")[0];
        done();
      })
      .catch((_e) => done.fail("dynamic login failed"));
  }, 30000);

  afterAll(() => {
    // Do NOT close thx.server here — bootstrap.js owns the server lifecycle.
    console.log("🚸 [chai] <<< completed WebSocket log tail owner binding spec");
  });

  afterEach(() => {
    while (openSockets.length) {
      const s = openSockets.pop();
      try { s.close(); } catch (_e) { /* ignore — socket may already be closed */ }
    }
  });

  function getPort() {
    const addr = thx.server && thx.server.address();
    return addr && addr.port ? addr.port : null;
  }

  function openClient(owner, withCookie) {
    const headers = {};
    if (withCookie) headers.Cookie = cookie;
    const ws = new WebSocket("ws://127.0.0.1:" + getPort() + "/" + owner, { headers: headers });
    const client = { ws: ws, frames: [], opened: false, close: null };
    ws.on('open', () => { client.opened = true; });
    ws.on('message', (data) => { client.frames.push(String(data)); });
    ws.on('close', (code) => { client.close = { code: code }; });
    ws.on('error', (_err) => { /* open/close/timeouts decide */ });
    openSockets.push(ws);
    return client;
  }

  async function waitFor(fn, ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const v = fn();
      if (v) return v;
      await sleep(25);
    }
    return fn() || null;
  }

  async function openOwnerSocket() {
    const c = openClient(envi.dynamic.owner, true);
    await waitFor(() => c.opened || c.close, 5000);
    expect(c.opened, "'open' within 5000 ms").to.equal(true);
    return c;
  }

  function foreignLogtail() {
    return JSON.stringify({ logtail: { owner_id: envi.oid, build_id: envi.build_id } });
  }

  it("(C1) the session owner's own path stays open", async function () {
    if (!getPort()) return;
    const c = await openOwnerSocket();
    await sleep(1500);
    expect(c.close).to.equal(null);
  }, 30000);

  it("(C2) the session cookie on another owner's path is closed with 1008", async function () {
    if (!getPort()) return;
    const c = openClient(envi.oid, true);
    const closed = await waitFor(() => c.close, 5000);
    expect(closed, "close within 5000 ms").to.not.equal(null);
    expect(closed.code).to.equal(1008);
  }, 30000);

  it("(C3) no cookie on the owner's path is closed with 1008", async function () {
    if (!getPort()) return;
    const c = openClient(envi.dynamic.owner, false);
    const closed = await waitFor(() => c.close, 5000);
    expect(closed, "close within 5000 ms").to.not.equal(null);
    expect(closed.code).to.equal(1008);
  }, 30000);

  it("(C4) a logtail naming another owner's build gets exactly the not-found frame", async function () {
    if (!getPort()) return;
    const c = await openOwnerSocket();
    c.ws.send(foreignLogtail());
    await sleep(1500);
    expect(c.frames).to.deep.equal([LOGTAIL_NOT_FOUND]);
    expect(c.close).to.equal(null);
  }, 30000);

  it("(C5) malformed frames do not take the socket or the process down", async function () {
    if (!getPort()) return;
    const c = await openOwnerSocket();
    for (const f of ["x", "null", "{\"logtail\":null}"]) c.ws.send(f);
    c.ws.send(foreignLogtail());
    const frame = await waitFor(() => c.frames.find((f) => f === LOGTAIL_NOT_FOUND), 5000);
    expect(frame).to.equal(LOGTAIL_NOT_FOUND);
    expect(c.close).to.equal(null);
  }, 30000);

  it("(C6) both HTTP tail routes are 404 after a WebSocket connected", async function () {
    if (!getPort()) return;
    await openOwnerSocket();
    for (const route of ['/api/user/logs/tail', '/api/v2/logs/tail']) {
      const res = await chai.request(thx.app)
        .post(route)
        .set('Cookie', cookie)
        .send({ build_id: envi.build_id });
      expect(res.status, route).to.equal(404);
    }
  }, 30000);
});
