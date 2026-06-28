const Influx = require('influx');
const Util = require('./util');
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
		return [
			"APIKEY_INVALID",
			"LOGIN_INVALID",
			"DEVICE_NEW",
			"DEVICE_CHECKIN",
			"DEVICE_REVOCATION",
			"BUILD_STARTED",
			"BUILD_SUCCESS",
			"BUILD_FAILED"
		];
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

    static createDB(db, cb) {
        const influx = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http'
        });
        influx.createDatabase(db).catch(e => {
            console.log("createDB", e);
        }).then(() => {

            const innerdb = new Influx.InfluxDB({
                host: 'influxdb',
                port: 8086,
                protocol: 'http',
                database: db
            });

            innerdb.createRetentionPolicy('31d', {
                duration: '31d',
                replication: 1
            });

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
