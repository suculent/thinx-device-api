const Influx = require('influx');
module.exports = class InfluxConnector {

    constructor(db) {
        this.influxdb = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http',
            database: db
        })
    }

    writePoint(point, callback) {

        //point.time = new Date().getMilliseconds();

        this.influxdb.writePoints([
            point
        ]).then(() => {
            return this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${point.measurement}", "owner_id"`, {
                placeholders: {
                    owner_id: "placeholder"
                }
            })
        }).then(rows => {
            if (typeof (callback) !== "undefined") callback(rows);
        })
    }

    query(measurement, callback) {
        this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${measurement}", "owner_id"`, {
            placeholders: {
                owner_id: "placeholder"
            }
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        })
    }

    queryOwner(measurement, owner_id, callback) {
        this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."${measurement}" WHERE "owner_id"='${owner_id}'`, {
            placeholders: {
                owner_id: "placeholder"
            }
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        })
    }

    /** Fetch daily stats for owner, needs proper query */
    today(owner_id, callback) {
        this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."*" WHERE "owner_id"='${owner_id}'`, {
            placeholders: {
                owner_id: "placeholder"
            }
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        })
    }

    /** Fetch weekly stats for owner, needs proper query */
    week(owner_id, callback) {
        this.influxdb.query(`SELECT mean("value") AS "mean_value" FROM "stats"."autogen"."*" WHERE "owner_id"='${owner_id}'`, {
            placeholders: {
                owner_id: "placeholder"
            }
        }).then( (retVal) => {
            if (typeof (callback) !== "undefined") callback(retVal);
        })
    }

    // Utility and pre-init methods

    static createDB(db, cb) {
        const influx = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http'
        });
        influx.createDatabase(db).then(() => {

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
