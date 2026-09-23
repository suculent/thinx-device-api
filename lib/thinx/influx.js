const Influx = require('influx');
const Util = require('./util');
const EventTaxonomy = require('./event_taxonomy.js');

// Declared retention for the stats database. Note this policy is not the default
// one -- writes and queries target "<db>"."autogen" -- so it currently holds no
// data; see the InfluxDB retention backlog item before making it default.
const RETENTION_POLICY = {
    name: '31d',
    options: {
        duration: '31d',
        replication: 1
    }
};
module.exports = class InfluxConnector {

    constructor(db) {
        this.influxdb = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http',
            database: db
        });
    }

    static statsLog(owner, error, data) {
        if (!Util.isDefined(owner)) owner = "0";
        console.log(`[OID:${owner}] [${error}] ${data}`);
        let obj = {
            measurement: error,
            tags: { 
                data: data,
                owner: owner 
            },
            fields: { value: 1 },
        };
        new InfluxConnector('stats').writePoint(obj);
    }
    
    static measurements() {
		// Derived from the single-source-of-truth taxonomy so the Influx
		// measurement list can never drift from statistics.js / emission sites.
		return EventTaxonomy.names();
	}

    writePoint(point, callback) {
        
        point.timestamp = new Date();

        this.influxdb.writePoints([ point ], { precision: 'ms' })
        .then(() => {
            // A write is just a write; the previous follow-up SELECT was malformed
            // (stray `, "owner_id"`) and pointless. Invoke the callback on success.
            if (typeof (callback) !== "undefined") callback([]);
        })
        .catch((e) => {
            console.log("writePoint", e);
            if (typeof (callback) !== "undefined") callback([]);
        });
    }

    query(measurement, callback) {
        if (!/^[a-zA-Z0-9_]+$/.test(measurement)) {
            throw new Error('Invalid input');
        }
        this.influxdb.query(`SELECT count("value") AS "count_value" FROM "stats"."autogen"."${measurement}"`).catch(e => {
            console.log("query", e);
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        });
    }

    /* used only by test spec */
    queryOwner(measurement, owner_id, callback) {
        
        console.log("queryOwner TEST with owner_id:", owner_id);

        if (!/^[a-zA-Z0-9_]+$/.test(measurement)) {
            throw new Error('Invalid input');
        }

        if (!/^[a-zA-Z0-9_]+$/.test(owner_id)) {
            throw new Error('Invalid input');
        }
       
        this.influxdb.query(`SELECT count("value") AS "count_value" FROM "stats"."autogen"."${measurement}" WHERE "owner"='${owner_id}'`).catch(e => {
            console.log("queryOwner", e);
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        });
    }

    /** Fetch daily stats for owner, needs proper query */
    async today(owner_id, callback) {
        let results = {};

        let midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        if (!/^[a-zA-Z0-9_]+$/.test(owner_id)) {
            throw new Error('Invalid input');
        }

        let kpis = InfluxConnector.measurements();
        for (let measurement in kpis) {
            let kpi = kpis[measurement];
            // this should be actually array of results
            results[kpi] = await this.influxdb.query(`SELECT count("value") AS "count_value" FROM "stats"."autogen"."${kpi}" WHERE "owner"='${owner_id}' AND time > '${midnight.toISOString()}'`).catch(e => {
                console.log("today", e);
            });
        }

        console.log("Day Loop ended, returning", JSON.stringify(results, null, 2));

        callback(true, results);
    }

    /** Fetch weekly stats for owner, needs proper query */
    async week(owner_id, callback) {

        if (!/^[a-zA-Z0-9_]+$/.test(owner_id)) {
            throw new Error('Invalid input');
        }

        let results = {};

        let kpis = InfluxConnector.measurements();

        for (let measurement in kpis) {
            let kpi = kpis[measurement];
            // this should be actually array of results
            results[kpi] = await this.influxdb.query(`SELECT count("value") AS "count_value" FROM "stats"."autogen"."${kpi}" WHERE "owner"='${owner_id}' AND time > now() - 7d`).catch((e) => {
                console.log("week", e);
            });
        }

        console.log("Week Loop ended, returning", JSON.stringify(results, null, 2));

        callback(true, results);
    }

    // Utility and pre-init methods

    /**
     * Reconciles the database and its retention policy with the declared spec.
     *
     * InfluxDB 1.x rejects CREATE RETENTION POLICY with "retention policy already
     * exists" whenever the name is taken by a policy of a different duration or
     * replication (production held "31d" at duration 24h0m0s). ALTER is the
     * idempotent counterpart, so create only when the name is free and alter
     * otherwise -- that converges on the declared spec without parsing durations.
     */
    static async provisionDB(db) {
        const admin = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http'
        });

        await admin.createDatabase(db); // CREATE DATABASE is idempotent

        const scoped = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http',
            database: db
        });

        const policies = await scoped.showRetentionPolicies(db);
        const exists = policies.some((policy) => policy.name === RETENTION_POLICY.name);

        if (exists) {
            await scoped.alterRetentionPolicy(RETENTION_POLICY.name, RETENTION_POLICY.options);
        } else {
            await scoped.createRetentionPolicy(RETENTION_POLICY.name, RETENTION_POLICY.options);
        }
    }

    static createDB(db, cb) {
        // Returns a promise for callers that can await it; the callback stays for
        // the existing ones. Rejections are logged here and never left floating --
        // an unhandled rejection on every boot is what Rollbar #1794 was reporting.
        return InfluxConnector.provisionDB(db)
            .catch((e) => {
                console.log("createDB", e.message || e);
            })
            .then(() => {
                if (typeof (cb) !== "undefined") cb();
            });
    }

    static createUser(user, pass, cb, admin = false) {
        const influx = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http'
        });
        influx.createUser(user, pass, admin).then(() => {
            if (typeof (cb) !== "undefined") cb();
        });
    }
};
