#!/bin/bash

#
# Section: Docker-in-Docker
#

# +e = prevents exit immediately if a command exits with a non-zero status (like StrictHostKeyChecking without a key...).

set +e

# Export AquaSec Microscanner Artifacts (if any)
MICROSCANNER_ARTIFACT="./artifacts/microscanner.html"
if [[ -f $MICROSCANNER_ARTIFACT ]]; then
  cp $MICROSCANNER_ARTIFACT /mnt/data/test-reports/microscanner.html
fi

echo "[thinx-entrypoint] Creating default DBs (TODO: only if does not exist)..."

DEVNULL="/dev/null"

curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_users > $DEVNULL
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_replicator > $DEVNULL
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_global_changes > $DEVNULL

export SQREEN_DISABLE_STARTUP_WARNING=1

export DOCKER_HOST="tcp://docker:2375"
export DOCKER_HOST="unix:///var/run/docker.sock"

if [[ -f ./.thinx_env ]]; then
  echo "[thinx-entrypoint] Sourcing .thinx_env (remove this after finding out what's inside so important that it's not a docker env var)"
  echo
  export
  echo
  cat ./.thinx_env
  source ./.thinx_env
else
  echo "[thinx-entrypoint] .thinx_env not found, expects ENVIRONMENT, ROLLBAR_ACCESS_TOKEN, ROLLBAR_ENVIRONMENT and REVISION variables to be set."
fi

echo "[thinx-entrypoint] Adding host checking exception for github.com..."
ssh -tt -o "StrictHostKeyChecking=no" git@github.com

if [[ ! -z $ROLLBAR_ACCESS_TOKEN ]]; then
  LOCAL_USERNAME=$(whoami)
  curl --silent https://api.rollbar.com/api/1/deploy/ \
    -F access_token=$ROLLBAR_ACCESS_TOKEN \
    -F environment=$ROLLBAR_ENVIRONMENT \
    -F revision=$REVISION \
    -F local_username=$LOCAL_USERNAME > /dev/null
  echo ""
else
  echo "[thinx-entrypoint] Skipping Rollbar deployment, ROLLBAR_ACCESS_TOKEN not defined... [${ROLLBAR_ACCESS_TOKEN}]"
fi

set -e

# workaround for log aggregator until solved using event database
mkdir -p /opt/thinx/.pm2/logs/
touch /opt/thinx/.pm2/logs/index-out-1.log

if [[ ${ENVIRONMENT} == "test" ]]; then
  echo "[thinx-entrypoint] Running in TEST MODE!"
  export CODECOV_TOKEN="734bc9e7-5671-4020-a26e-e6141f02b53d"
  export CODACY_PROJECT_TOKEN=9a7d084ad97e430ba12333f384b44255
  export CC_TEST_REPORTED_ID="e181ad1424f8f92834a556089394b2faadf93e9b6c84b831cefebb7ea06a8328"
  curl -L https://codeclimate.com/downloads/test-reporter/test-reporter-latest-linux-amd64 > ./cc-test-reporter
  chmod +x ./cc-test-reporter
  #./cc-test-reporter before-build
  npm run test # | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
  bash <(curl -Ls https://coverage.codacy.com/get.sh) report
  pwd
  ls -la
  # chmod +x ./.codecov.sh
  # ./.codecov.sh
  cp -vf ./lcov.info /mnt/data/test-reports/lcov.info
  cp -vfR ./.nyc_output /mnt/data/test-reports/.nyc_output
  # ./cc-test-reporter after-build --coverage-input-type clover --exit-code $?
else
  echo "[thinx-entrypoint] Starting in production mode..."
  node thinx.js | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
fi
