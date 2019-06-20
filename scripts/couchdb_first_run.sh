#!/bin/bash

USER=${COUCHDB_USERNAME:-couchdb}
PASS=${COUCHDB_PASSWORD:-$(pwgen -s -1 16)}
DB=${COUCHDB_DBNAME:-test}
URL="127.0.0.1" # depends on .env variable, should be 'couchdb' instead, mapped wherever...

THX_PREFIX=$(pwgen -s 12 1)
PFX_FILE=./conf/.thx_prefix

if [ -f $PFX_FILE ]; then
  THX_PREFIX=$(cat $PFX_FILE)
fi

if [[ ! -f ./conf/config.json ]]; then
  echo "./conf/config.json not configured yet."
  exit 1
fi

# Start CouchDB service (should be already started by docker-compose in future)
if [[ ! nc -vz localhost 5984 ]]; then
  /usr/local/bin/couchdb -b
  sleep 3
  while ! nc -vz localhost 5984; do sleep 1; done
fi

# Create User
echo "Creating user: \"$USER\"..."
curl -X PUT http://$URL:5984/_config/admins/$USER -d '"'${PASS}'"'

# Create Database
if [ ! -z "$DB" ]; then
    echo "Creating database: \"$DB\"..."
    curl -X PUT http://$USER:$PASS@127.0.0.1:5984/$DB

    echo $THX_PREFIX >> ./conf/.thx_prefix

    # Replace default credentials (works only if any? this should be from config.dist.json (or -sample))
    sed -i -- "s/rtmapi:frohikey/${USER}:${PASS}/g" ./conf/config.json
    curl -X PUT http://$USER:$PASS@$URL:5984/${THX_PREFIX}_managed_devices/_design/devicelib -d @design/design_deviceslib.json
    curl -X PUT http://$USER:$PASS@$URL:5984/${THX_PREFIX}_managed_users/_design/users -d @design/design_users.json
    curl -X PUT http://$USER:$PASS@$URL:5984/${THX_PREFIX}_managed_logs/_design/logs -d @design/design_logs.json
    curl -X PUT http://$USER:$PASS@$URL:5984/${THX_PREFIX}_managed_builds/_design/builds -d @design/design_builds.json
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
