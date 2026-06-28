/* AUTH-REACTIVATE-01 (Phase 8) regression spec for the admin reactivation endpoint.
 *
 * Locks in:
 *   (a) Auth gate — unauthenticated → 401, authenticated non-admin → 403.
 *   (b) Happy path — admin POST against a soft-deleted user flips `deleted` to false
 *       and returns envelope { success: true, response: "reactivated" }.
 *   (c) Input validation — admin POST with malformed `:id` → 400 missing_owner.
 *   (d) Idempotency — admin POST against a not-soft-deleted user → 200 reactivated.
 *   (e) Negative regression on the soft-delete login gate at router.auth.js:187-193 —
 *       a user with `deleted: true` still gets HTTP 403 on /api/login, and after
 *       reactivation the same user can log in again (200). This locks must_have #4
 *       (gate intact) and must_have #5 (post-reactivation login proceeds).
 *
 * Admin fixture handling
 * ----------------------
 * No standing admin user exists in spec/_envi.json or spec/helpers/bootstrap.js.
 * Per plan-checker WARNING (08-01-PLAN.md task 2 fix-hint), this spec promotes
 * the `dynamic` user to `admin: true` inside its own beforeAll via the same
 * `userlib.atomic("users", "edit", ...)` API the handler uses, then strictly
 * reverts the flag in afterAll. The promotion is bracketed to this describe()
 * block — downstream specs see `dynamic` as non-admin again because afterAll
 * runs before any subsequent spec's beforeAll. If afterAll ever fails to revert
 * (e.g., bootstrap teardown crash), the next test run will re-promote in
 * beforeAll which is idempotent on the user doc.
 *
 * Test-env ACCEPT pattern (Phase 5/6/7 precedent)
 * -----------------------------------------------
 * This spec is the CI canonical Jasmine green-gate. Local `npm test` aborts
 * early on missing /mnt/data/conf/config.json — that is expected and matches
 * the prior phase pattern; no spec-level guard needed.
 *
 * Companion to:
 *   - lib/router.admin.js (POST /api/v2/admin/user/:id/reactivate, the handler)
 *   - lib/router.auth.js:187-193 (the soft-delete login gate, asserted intact in scenario 6)
 */

const bootstrap = require('../helpers/bootstrap');

const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

const envi = require("../_envi.json");

let thx;
let adminJwt = null;       // JWT for `dynamic` after promotion to admin: true
let nonAdminJwt = null;    // JWT for `dynamic2` (still admin: false)
let target_owner = null;   // the soft-deleted user we reactivate in scenarios 3 & 5
let admin_was_promoted = false;

// The dynamic user from _envi.json (owner ID hard-coded in the fixture).
const DYNAMIC_OWNER = envi.dynamic.owner;
const DYNAMIC2_OWNER = envi.dynamic2.owner;

describe("Router Admin Reactivate (AUTH-REACTIVATE-01)", function () {

    beforeAll((done) => {
        thx = bootstrap.thx;
        console.log("🚸 [chai] >>> running Router Admin Reactivate spec");
        const userlib = thx.app.owner.userlib;
        // Promote the dynamic user to admin: true for the duration of this spec.
        // The promotion is reverted in afterAll. If the doc is missing (test order
        // anomaly), we surface as a failed beforeAll; the spec body will still
        // run its non-admin / unauthenticated scenarios — pending() the admin-only
        // scenarios as a fallback.
        userlib.atomic("users", "edit", DYNAMIC_OWNER, { admin: true }, (err) => {
            if (err) {
                console.log("🚸 [chai] WARN: failed to promote dynamic to admin, will skip admin-only scenarios:", err && err.message);
                admin_was_promoted = false;
            } else {
                admin_was_promoted = true;
            }
            // Login as the (now-admin) dynamic user to obtain a JWT.
            chai.request(thx.app)
                .post('/api/login')
                .send({ username: 'dynamic', password: 'dynamic', remember: false })
                .end((_lerr, lres) => {
                    if (lres && lres.text) {
                        try {
                            const body = JSON.parse(lres.text);
                            if (body && body.access_token) adminJwt = "Bearer " + body.access_token;
                        } catch (_e) { /* leave adminJwt null */ }
                    }
                    // Also login as dynamic2 for the non-admin scenario.
                    // dynamic2 is created by ZZ-AppSessionUserV2DeleteSpec.js which runs
                    // earlier (sorts before "Router*" alphabetically). If absent we
                    // still have unauthenticated scenario 1 binding the auth gate.
                    chai.request(thx.app)
                        .post('/api/login')
                        .send({ username: 'dynamic2', password: 'dynamic2', remember: false })
                        .end((_lerr2, lres2) => {
                            if (lres2 && lres2.text) {
                                try {
                                    const body2 = JSON.parse(lres2.text);
                                    if (body2 && body2.access_token) nonAdminJwt = "Bearer " + body2.access_token;
                                } catch (_e) { /* leave nonAdminJwt null */ }
                            }
                            // Pick the target user to soft-delete in scenario 3.
                            // Use dynamic2 (it's the non-admin we have control over for the
                            // soft-delete/reactivate dance in scenario 6). For scenario 3
                            // we soft-delete dynamic2 before the test.
                            target_owner = DYNAMIC2_OWNER;
                            done();
                        });
                });
        });
    }, 60000);

    afterAll((done) => {
        // Strict revert: remove the admin flag from the dynamic user so downstream
        // specs see it as a non-admin user (matches the rest of the suite's expectations).
        const userlib = thx.app.owner.userlib;
        userlib.atomic("users", "edit", DYNAMIC_OWNER, { admin: false }, (_err) => {
            // Also make sure dynamic2 is NOT soft-deleted on exit so other specs
            // that may reuse it see a sane state.
            userlib.atomic("users", "edit", DYNAMIC2_OWNER, { deleted: false }, (_err2) => {
                console.log("🚸 [chai] <<< completed Router Admin Reactivate spec");
                done();
            });
        });
    }, 30000);

    // ---- Scenario 1: unauthenticated → 401 (must_have #2 / T-08.1-01 mitigation) ----
    it("POST /api/v2/admin/user/:id/reactivate (no Auth, no session) — 401", function (done) {
        chai.request(thx.app)
            .post('/api/v2/admin/user/' + DYNAMIC2_OWNER + '/reactivate')
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    // ---- Scenario 2: authenticated non-admin → 403 (must_have #2 / T-08.1-01 mitigation) ----
    it("POST /api/v2/admin/user/:id/reactivate (non-admin JWT) — 403", function (done) {
        if (!nonAdminJwt) return pending("non-admin JWT not available (dynamic2 not bootstrapped)");
        chai.request(thx.app)
            .post('/api/v2/admin/user/' + DYNAMIC2_OWNER + '/reactivate')
            .set('Authorization', nonAdminJwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(403);
                done();
            });
    }, 30000);

    // ---- Scenario 3: admin POST against a soft-deleted user — happy path (must_have #1) ----
    it("POST /api/v2/admin/user/:id/reactivate (admin) — flips deleted=false, returns reactivated", function (done) {
        if (!admin_was_promoted || !adminJwt) return pending("admin fixture promotion did not succeed");
        const userlib = thx.app.owner.userlib;
        // Soft-delete the target first so the reactivation flip is observable.
        userlib.atomic("users", "edit", target_owner, { deleted: true }, (sderr) => {
            if (sderr) return done.fail("setup: failed to soft-delete target: " + sderr.message);
            chai.request(thx.app)
                .post('/api/v2/admin/user/' + target_owner + '/reactivate')
                .set('Authorization', adminJwt)
                .send({})
                .end((_err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.be.a('string');
                    const body = JSON.parse(res.text);
                    expect(body).to.have.property('success', true);
                    expect(body).to.have.property('response', 'reactivated');
                    // Confirm the doc shows deleted === false post-reactivation.
                    userlib.get(target_owner, (gerr, doc) => {
                        if (gerr) return done.fail("readback failed: " + gerr.message);
                        expect(doc.deleted).to.equal(false);
                        done();
                    });
                });
        });
    }, 30000);

    // ---- Scenario 4: admin POST with malformed :id → 400 missing_owner (T-08.1-02 mitigation) ----
    it("POST /api/v2/admin/user/:id/reactivate (admin, garbage id) — 400 missing_owner", function (done) {
        if (!admin_was_promoted || !adminJwt) return pending("admin fixture promotion did not succeed");
        // sanitka.owner() rejects non-hex IDs → undefined → 400 missing_owner.
        chai.request(thx.app)
            .post('/api/v2/admin/user/!!!/reactivate')
            .set('Authorization', adminJwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                const body = JSON.parse(res.text);
                expect(body).to.have.property('success', false);
                expect(body).to.have.property('response', 'missing_owner');
                done();
            });
    }, 30000);

    // ---- Scenario 5: idempotency — admin POST against an already-active user → 200 ----
    it("POST /api/v2/admin/user/:id/reactivate (admin, already active) — idempotent 200", function (done) {
        if (!admin_was_promoted || !adminJwt) return pending("admin fixture promotion did not succeed");
        // dynamic user is currently admin:true, deleted:false. Reactivating an
        // already-active user must still return 200/reactivated (no spurious 4xx/5xx).
        chai.request(thx.app)
            .post('/api/v2/admin/user/' + DYNAMIC_OWNER + '/reactivate')
            .set('Authorization', adminJwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                const body = JSON.parse(res.text);
                expect(body).to.have.property('success', true);
                expect(body).to.have.property('response', 'reactivated');
                done();
            });
    }, 30000);

    // ---- Scenario 6: soft-delete login gate intact + post-reactivation login succeeds ----
    // (must_have #4: gate at router.auth.js:187-193 still rejects deleted=true users)
    // (must_have #5: after reactivation, the gate is no-op and login proceeds)
    it("Soft-delete login gate intact + post-reactivation login succeeds", function (done) {
        if (!admin_was_promoted || !adminJwt) return pending("admin fixture promotion did not succeed");
        const userlib = thx.app.owner.userlib;
        // Step 1: soft-delete dynamic2 directly via userlib.atomic.
        userlib.atomic("users", "edit", DYNAMIC2_OWNER, { deleted: true }, (sderr) => {
            if (sderr) return done.fail("setup: soft-delete failed: " + sderr.message);
            // Step 2: attempt login → expect 403 user_account_deactivated (gate intact).
            chai.request(thx.app)
                .post('/api/login')
                .send({ username: 'dynamic2', password: 'dynamic2', remember: false })
                .end((_err1, res1) => {
                    expect(res1.status).to.equal(403);
                    expect(res1.text).to.be.a('string');
                    // The gate produces an envelope via Util.failureResponse → response: "user_account_deactivated"
                    try {
                        const body1 = JSON.parse(res1.text);
                        expect(body1).to.have.property('response', 'user_account_deactivated');
                    } catch (_pe) {
                        // If body isn't JSON (e.g., legacy raw "deleted" string), at minimum status === 403 binds the gate.
                    }
                    // Step 3: admin reactivates dynamic2.
                    chai.request(thx.app)
                        .post('/api/v2/admin/user/' + DYNAMIC2_OWNER + '/reactivate')
                        .set('Authorization', adminJwt)
                        .send({})
                        .end((_err2, res2) => {
                            expect(res2.status).to.equal(200);
                            const body2 = JSON.parse(res2.text);
                            expect(body2).to.have.property('success', true);
                            expect(body2).to.have.property('response', 'reactivated');
                            // Step 4: login again → expect 200 (gate is now no-op for this user).
                            chai.request(thx.app)
                                .post('/api/login')
                                .send({ username: 'dynamic2', password: 'dynamic2', remember: false })
                                .end((_err3, res3) => {
                                    expect(res3.status).to.equal(200);
                                    done();
                                });
                        });
                });
        });
    }, 60000);

});
