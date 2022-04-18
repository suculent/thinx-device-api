# Statistics Roadmap

The plan is to migrate statistics from log-parser to declarative event logging directly from code.

Results should be leveraged in two ways:

1. THiNX API will serve InfluxDB data as statistics (will be responsible for AAA and ETL) to provide results to legacy console
2. Vue console could possibly render much more graphs as imported HTML directly from Chronograf

Statistics must be split by owner.

### Initial dev commands

    curl -i -XPOST http://influxdb:8086/query --data-urlencode "q=CREATE DATABASE dev"

### Write in 1.8 format

    curl -i -XPOST 'http://influxdb:8086/write?db=dev' --data-binary 'checkin,host=udid value=1.0'

    curl -i -XPOST 'http://influxdb:8086/write?db=dev' --data-binary 'checkin,owner=oid,host=udid value=1.0'

### Remote testing

    curl -i -XPOST 'https://influx.thinx.cloud/write?db=dev' --data-binary 'checkin,owner=oid,host=udid value=1.0'