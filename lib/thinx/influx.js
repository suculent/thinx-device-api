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

        this.influxdb.writePoints([
            point
        ]).then(() => {
            return this.influxdb.query(` select * from ${point.measurement}
                                    where owner_id = ${point.owner_id}
                                    order by time desc
                                    limit 10
                                `, {
                placeholders: {
                    owner_id: "placeholder"
                }
            })
        }).then(rows => {
            if (typeof (callback) !== "undefined") callback(rows);
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
