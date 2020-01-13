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

echo "[thinx-entrypoint] Creating default DBs..."

curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_users > /dev/null
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_replicator > /dev/null
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_global_changes > /dev/null

export SQREEN_DISABLE_STARTUP_WARNING=1

echo "[thinx-entrypoint] Enabling IPV4 forwarding..."
sysctl net.ipv4.ip_forward=1
sysctl -w net.ipv4.conf.all.forwarding=1

export DOCKER_HOST="tcp://docker:2375"
export DOCKER_HOST="unix:///var/run/docker.sock"

# exec "$@"

source ~/.profile

pwd

if [[ -f ./.thinx_env ]]; then
  echo "[thinx-entrypoint] Sourcing .thinx_env"
  source ./.thinx_env
else
  echo "[thinx-entrypoint] .thinx_env not found, expects ENVIRONMENT, ROLLBAR_ACCESS_TOKEN, ROLLBAR_ENVIRONMENT and REVISION variables to be set."
fi

# Installs all tools, not just those currently allowed by .dockerignore, requires running Docker
if [[ ! -z $(which docker) ]]; then
  echo "[thinx-entrypoint] Installing Build-tools for DinD/DooD"
  cd builders
  bash ./install-builders.sh
  cd ..
else
  echo "[thinx-entrypoint] Skipping build-tools installation, Docker not available."
fi

echo "[thinx-entrypoint] Adding host checking exception for github.com..."
ssh -tt -o "StrictHostKeyChecking=no" git@github.com

echo "[thinx-entrypoint] Deploying with Rollbar..."
if [[ ! -z $ROLLBAR_ACCESS_TOKEN ]]; then
  LOCAL_USERNAME=$(whoami)
  curl --silent https://api.rollbar.com/api/1/deploy/ \
    -F access_token=$ROLLBAR_ACCESS_TOKEN \
    -F environment=$ROLLBAR_ENVIRONMENT \
    -F revision=$REVISION \
    -F local_username=$LOCAL_USERNAME > /dev/null
  echo ""
else
  echo "[thinx-entrypoint] Skipping Rollbar deployment, access token not defined..."
fi

set -e

# workaround for log aggregator until solved using event database
mkdir -p /opt/thinx/.pm2/logs/
touch /opt/thinx/.pm2/logs/index-out-1.log

if [ $ENVIRONMENT == "test" ]; then
  echo "[thinx-entrypoint] Running in TEST MODE!"
  export CODECOV_TOKEN="734bc9e7-5671-4020-a26e-e6141f02b53d"
  export CODACY_PROJECT_TOKEN=9a7d084ad97e430ba12333f384b44255
  export CC_TEST_REPORTED_ID="e181ad1424f8f92834a556089394b2faadf93e9b6c84b831cefebb7ea06a8328"
  npm run test # | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
  curl -L https://codeclimate.com/downloads/test-reporter/test-reporter-latest-linux-amd64 > ./cc-test-reporter
  chmod +x ./cc-test-reporter
  pwd
  ls -la
  # chmod +x ./.codecov.sh
  # ./.codecov.sh
  cp -vf ./lcov.info /mnt/data/test-reports/lcov.info
  cp -vfR ./.nyc_output /mnt/data/test-reports/.nyc_output
else
  echo "[thinx-entrypoint] Starting in production mode..."
  node thinx.js | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
fi
