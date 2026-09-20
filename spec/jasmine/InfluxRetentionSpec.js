/*
 * Regression guard for Rollbar #1794 "Error from InfluxDB: retention policy already exists".
 *
 * InfluxDB 1.x rejects CREATE RETENTION POLICY when a policy of that name already
 * exists with a different spec (production held "31d" at duration 24h0m0s). The
 * rejection used to escape createDB() as an unhandled promise rejection on every
 * API boot, which is what Rollbar kept reporting.
 */

const Influx = require('influx');
const { expect } = require('chai');
const InfluxConnector = require('../../lib/thinx/influx');

const TEST_DB = 'thinx_retention_spec';

const admin = () => new Influx.InfluxDB({ host: 'influxdb', port: 8086, protocol: 'http' });
const scoped = () => new Influx.InfluxDB({ host: 'influxdb', port: 8086, protocol: 'http', database: TEST_DB });

const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

const policy31d = async () => {
    const policies = await scoped().showRetentionPolicies(TEST_DB);
    return policies.find((p) => p.name === '31d');
};

describe("InfluxDB retention policy provisioning", function () {

    let rejections = [];
    const collect = (reason) => rejections.push(reason);

    beforeAll(async () => {
        await admin().dropDatabase(TEST_DB).catch(() => { /* first run */ });
        await admin().createDatabase(TEST_DB);
        // Reproduce the production drift: right name, wrong duration.
        await scoped().createRetentionPolicy('31d', { duration: '24h', replication: 1 });
        process.on('unhandledRejection', collect);
    });

    afterAll(async () => {
        process.removeListener('unhandledRejection', collect);
        await admin().dropDatabase(TEST_DB).catch(() => { /* best effort */ });
    });

    beforeEach(() => {
        rejections = [];
    });

    it("reconciles a drifted retention policy instead of rejecting", async () => {
        await InfluxConnector.createDB(TEST_DB);
        await settle();

        expect(rejections.map((r) => r.message)).to.deep.equal([]);
        expect((await policy31d()).duration).to.equal('744h0m0s');
    });

    it("is idempotent on a second boot", async () => {
        await InfluxConnector.createDB(TEST_DB);
        await settle();

        expect(rejections.map((r) => r.message)).to.deep.equal([]);
        expect((await policy31d()).duration).to.equal('744h0m0s');
    });

    it("creates the policy when the database is brand new", async () => {
        await admin().dropDatabase(TEST_DB);

        await new Promise((resolve) => InfluxConnector.createDB(TEST_DB, resolve));
        await settle();

        expect(rejections.map((r) => r.message)).to.deep.equal([]);
        const policy = await policy31d();
        expect(policy, 'policy "31d" should have been created').to.not.equal(undefined);
        expect(policy.duration).to.equal('744h0m0s');
    });
});
