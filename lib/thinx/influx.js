module.exports = class InfluxConnector {

    static write(point, callback) {

        // Can use HTTPS as well (externally)

        const Influx = require('influx');

        const influx = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http'
        });

        influx.createUser('dev', 'dev', true) // make 'dev' an admin

        influx.createDatabase('dev').then(() => {

            const influxdb = new Influx.InfluxDB({
                host: 'influxdb',
                port: 8086,
                protocol: 'http',
                database: 'dev' /*,
                schema: [
                    {
                        measurement: 'LOGIN_INVALID',
                        fields: {
                            value: Influx.FieldType.INTEGER
                        },
                        tags: [
                            'owner_id'
                        ]
                    }
                ] */
            })

            influxdb.createRetentionPolicy('1m', {
                duration: '1m',
                replication: 1
            });


            influxdb.writePoints([
                point
            ]).then(() => {
                return influxdb.query(`   select * from ${json.measurement}
                                        where owner_id = $<owner_id>
                                        order by time desc
                                        limit 10
                                    `, {
                    placeholders: {
                        host: os.hostname()
                    }
                })
            }).then(rows => {
                rows.forEach(row => console.log(`A request to ${row.path} took ${row.duration}ms`))
                if (typeof (callback) !== "undefined") callback(rows);
            })
        });
    }
};
