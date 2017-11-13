#!/bin/bash

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
BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/builds/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z

DB=${PREFIX}'managed_logs/'
MINDATE=$(date -d '1 month ago' '+%Y-%m-%d')
BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/logs/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z


# migrate databases witg optional cleanup
DATE=$(date "+%Y-%m-%d")
curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_builds","target":"managed_builds_'${DATE}'", "create_target":true }'
echo "Migration of builds completed."

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_devices","target":"managed_devices_'${DATE}'", "create_target":true }'
echo "Migration of devices completed."

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_logs","target":"managed_logs_'${DATE}'", "create_target":true }'
echo "Migration of logs completed."

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_sources","target":"managed_sources_'${DATE}'", "create_target":true }'
echo "Migration of sources completed."

curl -XPOST ${PREFIX}_replicate -H 'Content-Type: application/json' -d'{"source":"managed_users","target":"managed_users_'${DATE}'", "create_target":true, "filter":"users/del"}'
echo "Migration of users (without deletions) completed."

# delete all logs older than one month
DB=${PREFIX}'managed_builds/'
MINDATE=$(date -d '7 days ago' '+%Y-%m-%d')
BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/builds/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z

DB=${PREFIX}'managed_logs/'
MINDATE=$(date -d '1 month ago' '+%Y-%m-%d')
BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/logs/_update/delete_expired/id?mindate=${MINDATE}T00:00:00.000Z
