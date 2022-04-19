module.exports = class InfluxConnector {

    static write(point, callback) {

        // Can use HTTPS as well (externally)
        
        const Influx = require('influx');

        const influx = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http'})

        influx.createDatabase('dev');

        const influxdb = new Influx.InfluxDB({
            host: 'influxdb',
            port: 8086,
            protocol: 'http',
            database: 'dev',
            schema: [
                {
                    measurement: 'response_times',
                    fields: {
                        path: Influx.FieldType.STRING,
                        duration: Influx.FieldType.INTEGER
                    },
                    tags: [
                        'host'
                    ]
                }
            ]
        })

        influxdb.writePoints([
            point
        ]).then(() => {
            return influx.query(`   select * from ${json.measurement}
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
            if (typeof(callback) !== "undefined") callback(rows);
        })
    }
};
