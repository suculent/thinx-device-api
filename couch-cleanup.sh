#!/bin/bash

PREFIX=$(cat ./conf/.thx_prefix)

# delete all logs older than one month
DB='http://localhost:5984/${PREFIX}_managed_builds/'
MINDATE="$(date -v -7d "+%Y-%m-%d")T00:00:00.000Z"
BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
CLEANUP_RESULT=$(curl -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/builds/_update/delete_expired/id?mindate=${MINDATE})
echo $CLEANUP_RESULT

DB='http://localhost:5984/${PREFIX}_managed_logs/'
MINDATE="$(date -v -1m "+%Y-%m-%d")T00:00:00.000Z"
BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
CLEANUP_RESULT=$(curl -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/logs/_update/delete_expired/id?mindate=${MINDATE})
echo $CLEANUP_RESULT
