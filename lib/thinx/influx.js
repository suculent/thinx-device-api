const Influx = require('influx');

module.exports = class Influx {

    static write(json) {

        // Can use HTTPS as well (externally)

        const influx = new Influx.InfluxDB({
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

        influx.writePoints([
            {
                measurement: 'response_times',
                tags: { host: os.hostname() },
                fields: { duration, path: req.path },
            }
        ]).then(() => {
            return influx.query(`
                                    select * from response_times
                                    where host = $<host>
                                    order by time desc
                                    limit 10
                                `, {
                placeholders: {
                    host: os.hostname()
                }
            })
        }).then(rows => {
            rows.forEach(row => console.log(`A request to ${row.path} took ${row.duration}ms`))
        })

        return true;
    }
};
