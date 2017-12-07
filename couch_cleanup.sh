#!/bin/bash

set -e

#statements
# Cleanup script, should be called at least daily with cron.
# Performs database backup. May delete and recreate some DBs by backwards migration without deleted items.

if [ -f ./conf/.thx_prefix ]; then
  PREFIX="http://${COUCHDB_CREDS}@localhost:5984/$(cat ./conf/.thx_prefix)_"
else
  PREFIX="http://${COUCHDB_CREDS}@localhost:5984/"
fi

# delete all logs older than one month
DB=${PREFIX}'managed_builds/'
MINDATE=$(date -d '7 days ago' '+%Y-%m-%d')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/builds/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z

DB=${PREFIX}'managed_logs/'
MINDATE=$(date -d '1 month ago' '+%Y-%m-%d')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/logs/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z


#
# This is a new implementation for CouchDB 2 where data are separated into shards
#

# 1. replicate running database(s)
# 2.

SHARDS=$(ls /opt/couchdb/data/shards)
for SHARD in $SHARDS
do
  echo "Processing shard $SHARD"
  MANAGED_DBS=$(ls /opt/couchdb/data/shards/$SHARD/managed_*.couch)
  for DB in $MANAGED_DBS
  do
    DB_NAME=$(basename $DB)
    echo "Extracting DB_NAME: $DB_NAME"
    DB_NAME=$(echo $DB_NAME | | sed 's/\.couch/couch/g')
    echo "Processing DB_NAME: $DB_NAME"
    BARE_NAME=$(echo $DB_NAME | sed 's/[0-9.]//g')
    echo "Processing BARE_NAME: $BARE_NAME"
    TARGET_NAME=$(echo $BARE_NAME | sed 's/managed/replicated/g')
    echo "Processing TARGET_NAME: $TARGET_NAME"

    # Remove old replica (may backup as well)
    # curl -XDELETE $TARGET_NAME -H 'Content-Type: application/json'

    # Replicate again
    curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"${DB_NAME}","target":"${TARGET_NAME}", "create_target":true }'

    # Swap replica with live DB
  done
done

exit 0

# migrate databases with optional cleanup
DATE=$(date "+%Y-%m-%d")
curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_builds","target":"replicated_builds", "create_target":true }'
echo "Migration of builds completed."

#
# Old way to swap databases... deprecated.
#

if [[ -f /opt/couchdb/data/managed_builds.backup ]]; then
  rm /opt/couchdb/data/managed_builds.backup
fi
mv /opt/couchdb/data/managed_builds.couch /opt/couchdb/data/managed_builds.backup
mv /opt/couchdb/data/managed_builds_${DATE}.couch /opt/couchdb/data/managed_builds.couch

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_devices","target":"managed_devices_'${DATE}'", "create_target":true }'
echo "Migration of devices completed."

if [[ -f /opt/couchdb/data/managed_devices.backup ]]; then
  rm /opt/couchdb/data/managed_devices.backup
fi
mv /opt/couchdb/data/managed_devices.couch /opt/couchdb/data/managed_devices.backup
mv /opt/couchdb/data/managed_devices_${DATE}.couch /opt/couchdb/data/managed_devices.couch

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_logs","target":"managed_logs_'${DATE}'", "create_target":true }'
echo "Migration of logs completed."

if [[ -f /opt/couchdb/data/managed_logs.backup ]]; then
  rm /opt/couchdb/data/managed_logs.backup
fi
mv /opt/couchdb/data/managed_logs.couch /opt/couchdb/data/managed_logs.backup
mv /opt/couchdb/data/managed_logs_${DATE}.couch /opt/couchdb/data/managed_logs.couch

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_sources","target":"managed_sources_'${DATE}'", "create_target":true }'
echo "Migration of sources completed."

if [[ -f /opt/couchdb/data/managed_sources.backup ]]; then
  rm /opt/couchdb/data/managed_sources.backup
fi
mv /opt/couchdb/data/managed_sources.couch /opt/couchdb/data/managed_sources.backup
mv /opt/couchdb/data/managed_sources_${DATE}.couch /opt/couchdb/data/managed_sources.couch

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_users","target":"managed_users_'${DATE}'", "create_target":true, "filter":"users/del"}'
echo "Migration of users (without deletions) completed."

if [[ -f /opt/couchdb/data/managed_users.backup ]]; then
  rm /opt/couchdb/data/managed_users.backup
fi
mv /opt/couchdb/data/managed_users.couch /opt/couchdb/data/managed_users.backup
mv /opt/couchdb/data/managed_users_${DATE}.couch /opt/couchdb/data/managed_users.couch
