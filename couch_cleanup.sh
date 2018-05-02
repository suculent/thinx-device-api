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

if [ ! -z $CIRCLE_USERNAME ]; then
  PREFIX="http://${COUCHDB_CREDS}@dev.thinx.cloud:5984/"
fi

# delete all logs older than one month
DB=${PREFIX}'managed_builds/'
MINDATE=$(date -d '7 days ago' '+%Y-%m-%d')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -s -X POST ${DB}/_design/builds/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z

DB=${PREFIX}'managed_logs/'
MINDATE=$(date -d '1 month ago' '+%Y-%m-%d')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -s -X POST ${DB}/_design/logs/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z

# added with GDPR: delete unused accounts after 3 months
DB=${PREFIX}'managed_users/'
MINDATE=$(date -d '3 months ago' '+%Y-%m-%d')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -s -X POST ${DB}/_design/logs/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z


#
# This is a new implementation for CouchDB 2 where data are separated into shards
#

# 1. replicate running database(s)
# 2.

#SHARDS=$(ls /opt/couchdb/data/shards)

# We have set shards to 1 so we can just parse this one:
SHARDS=$(ls /opt/couchdb/data/shards/00000000-ffffffff)
for SHARD in $SHARDS
do
  if [[ $SHARD!=="00000000-ffffffff" ]]; then
    continue
  fi
  echo "Processing shard $SHARD"
  MANAGED_DBS=$(ls /opt/couchdb/data/shards/$SHARD/managed_*.couch)
  for DB in $MANAGED_DBS
  do
    DATABASE_NAME=$(basename $DB)
    DB_NAME=${DATABASE_NAME//.couch/} #DB_NAME=$(echo $DATABASE_NAME | sed 's/.couch//g')
    BARE_NAME=${DB_NAME//[0-9.]/}
    TARGET_NAME=${BARE_NAME//managed/replicated}

    echo "Processing BARE_NAME: $BARE_NAME"

    # Remove old replica (may backup as well)
    echo "Deleting database TARGET_NAME: $TARGET_NAME"
    curl -XDELETE $TARGET_NAME -H 'Content-Type: application/json'

    echo "Replicating database $BARE_NAME to $TARGET_NAME:"
    curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"'${BARE_NAME}'","target":"'${TARGET_NAME}'", "create_target":true }'

    # Swap replica with live DB

    # Move running version to a backup
    SRCA=$DATABASE_NAME.couch
    DSTA=$DB_NAME.backup
    echo "Moving $SRCA to $DSTA"
    mv $SRCA $DSTA

    # Move replica to a running version
    SRCB=$TARGET_NAME.couch
    DSTB=$DATABASE_NAME.couch
    echo "Moving $SRCB to $DSTB"
    mv $SRCB $DSTB

  done
done
