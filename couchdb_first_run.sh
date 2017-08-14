#!/bin/bash
USER=${COUCHDB_USERNAME:-couchdb}
PASS=${COUCHDB_PASSWORD:-$(pwgen -s -1 16)}
DB=${COUCHDB_DBNAME:-test}

THX_PREFIX=$(pwgen -s 5 1)

# Start CouchDB service
sleep 3
/usr/local/bin/couchdb -b
while ! nc -vz localhost 5984; do sleep 1; done

# Create User
echo "Creating user: \"$USER\"..."
curl -X PUT http://127.0.0.1:5984/_config/admins/$USER -d '"'${PASS}'"'

# Create Database
if [ ! -z "$DB" ]; then
    echo "Creating database: \"$DB\"..."
    curl -X PUT http://$USER:$PASS@127.0.0.1:5984/$DB

    echo $THX_PREFIX ./conf/.thx_prefix

    sed -i -- 's/rtmapi:frohikey/${USER}:${PASS}/g' ./conf/conf.json
    curl -X PUT http://$USER:$PASS@127.0.0.1:5984/${THX_PREFIX}_managed_devices/_design/devicelib -d @design/design_deviceslib.json
    curl -X PUT http://$USER:$PASS@127.0.0.1:5984/${THX_PREFIX}_managed_users/_design/users -d @design/design_users.json
    curl -X PUT http://$USER:$PASS@127.0.0.1:5984/${THX_PREFIX}_managed_logs/_design/logs -d @design/design_logs.json
    curl -X PUT http://$USER:$PASS@127.0.0.1:5984/${THX_PREFIX}_managed_builds/_design/builds -d @design/design_builds.json
fi

echo "========================================================================"
echo "CouchDB User: \"$USER\""
echo "CouchDB Password: \"$PASS\""
if [ ! -z "$DB" ]; then
    echo "CouchDB Database: \"$DB\""
fi
echo "========================================================================"

# Stop CouchDB service
/usr/local/bin/couchdb -d

rm -f /.firstrun
