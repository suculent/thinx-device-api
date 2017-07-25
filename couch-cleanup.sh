#!/bin/bash

# delete all logs older than one month
DB='http://localhost:5984/managed_builds/'
MINDATE="$(date -v -7d "+%Y-%m-%d")T00:00:00.000Z"
BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
CLEANUP_RESULT=$(curl -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/builds/_update/delete_expired/id?mindate=${MINDATE})

