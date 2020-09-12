#!/bin/bash

cd app

if [[ -z $THINX_TRANSFORMER_PORT ]]; then
  echo "THINX_TRANSFORMER_PORT is not set. Default value: 7474; default GitLab CI value: 5000"
fi

echo "Installing test-only dependencies:"

## Coverage
curl -o- -L https://yarnpkg.com/install.sh | bash
yarn global add v8-coverage

# OR
# cd /opt
# wget https://yarnpkg.com/latest.tar.gz
# tar zvxf latest.tar.gz
# Yarn is now in /opt/yarn-[version]/

## Application Server
cov8 node transformer.js &
# npm install -g pm2
# pm2 start ecosystem.json

echo "Running smoke-test with CURL:"

TEST1=$(curl -vvv -POST \
-H "Content-Type: application/json" \
-d '{ "jobs": [ { "id": "transaction-identifier", "owner": "owner-id", "codename": "status-transformer-alias", "code": "function transformer(status, device) { return status; };", "params": { "status": "Battery 100.0V", "device": { "owner": "owner-id", "id": "device-id" } } } ] }' \
http://localhost:$THINX_TRANSFORMER_PORT/do)

if [[ -z $TEST1 ]]; then
  echo "No result: ${TEST1}"
else
  echo "With result: ${TEST1}"
fi

NOERROR=$(echo $TEST | grep '\"error\":\"{}\"' | wc -l)

if [[ ! -z $NOERROR ]]; then
  echo "OK"
  exit 0
else
  echo "FAILED"
  exit 1
fi
