const Influx = require('influx');
module.exports = class InfluxConnector {

    constructor(db) {
        this.influxdb = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http',
            database: db
        });
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

        this.influxdb.writePoints([ point ], { precision: 'ms' })
        .catch((e) => { console.log("writePoint", e); })
        .then(() => {
            return this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${point.measurement}", "owner_id"`, {
                placeholders: {
                    owner_id: "placeholder"
                }
            });
        }).then(rows => {
            if (typeof (callback) !== "undefined") callback(rows);
        });
    }

    query(measurement, callback) {
        this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${measurement}", "owner_id"`, {
            placeholders: {
                owner_id: "placeholder"
            }
        }).catch(e => {
            console.log("query", e);
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        });
    }

    queryOwner(measurement, owner_id, callback) {
        this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${measurement}" WHERE "owner_id"='${owner_id}'`, {
            placeholders: {
                owner_id: "placeholder"
            }
        }).catch(e => {
            console.log("queryOwner", e);
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        });
    }

    /** Fetch daily stats for owner, needs proper query */
    today(owner_id, callback) {
        let results = {};

        let midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        for (let measurement in InfluxConnector.measurements()) {
            this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${measurement}" WHERE "owner_id"='${owner_id} AND time > ${midnight}'`, {
                placeholders: {
                    owner_id: "placeholder"
                }
            }).catch(e => {
                console.log("today", e);
            }).then( (retVal) => {
                results[measurement] = retVal;
            });
        }

        console.log("Day Loop ended, returning", JSON.stringify(results, null, 2));

        callback(true, results);
    }

    /** Fetch weekly stats for owner, needs proper query */
    week(owner_id, callback) {

        let results = {};
        
        let ago = new Date().getDate() - 7;
        let week_ago = new Date().setDate(ago);

        for (let measurement in InfluxConnector.measurements()) {
            this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${measurement}" WHERE "owner_id"='${owner_id} AND time > ${week_ago}'`, {
                placeholders: {
                    owner_id: "placeholder"
                }
            }).catch(e => {
                console.log("week", e);
            }).then( (retVal) => {
                results[measurement] = retVal;
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
