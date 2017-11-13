#!/bin/bash

if [ -f ./conf/.thx_prefix ]; then
  PREFIX="http://localhost:5984/$(cat ./conf/.thx_prefix)_"
else
  PREFIX="http://localhost:5984/"
fi

DATE="$(date "+%Y-%m-%d")
curl -x POST ${PREFIX}_replicate -d'{"source":"managed_builds","target":"managed_builds_${DATE}", "create_target":true }'
curl -x POST ${PREFIX}_replicate -d'{"source":"managed_devices","target":"managed_builds_${DATE}", "create_target":true }'
curl -x POST ${PREFIX}_replicate -d'{"source":"managed_logs","target":"managed_builds_${DATE}", "create_target":true }'
curl -x POST ${PREFIX}_replicate -d'{"source":"managed_sources","target":"managed_builds_${DATE}", "create_target":true }'
curl -x POST ${PREFIX}_replicate -d'{"source":"managed_users","target":"managed_builds_${DATE}", "create_target":true, "filter":"users/del"}'

# delete all logs older than one month
DB=${PREFIX}'managed_builds/'
MINDATE="$(date -d '7 days ago' "+%Y-%m-%d")T00:00:00.000Z"
#BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
CLEANUP_RESULT=$(curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/builds/_update/delete_expired/id?mindate=${MINDATE})
# echo $CLEANUP_RESULT

DB=${PREFIX}'managed_logs/'
MINDATE="$(date -d '1 month ago' "+%Y-%m-%d")T00:00:00.000Z"
#BUILD_IDS=$(curl "$DB/_all_docs" | jq '.rows | .[].id')
CLEANUP_RESULT=$(curl -s -X GET "$DB/_all_docs" | jq '.rows | .[].id' | sed -e 's/"//g' | sed -e 's/_design.*//g' | xargs -I id curl -X POST ${DB}/_design/logs/_update/delete_expired/id?mindate=${MINDATE})
# echo $CLEANUP_RESULT
