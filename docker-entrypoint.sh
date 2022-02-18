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


DEVNULL="/dev/null"

# returns error in case the DB is already created (error is intentionally ignored, 
# but should be more specific to fail safely in case the DB would not be available)
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_users > $DEVNULL
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_replicator > $DEVNULL
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@couchdb:5984/_global_changes > $DEVNULL

export SQREEN_DISABLE_STARTUP_WARNING=1

export DOCKER_HOST="tcp://docker:2375"
export DOCKER_HOST="unix:///var/run/docker.sock"

echo "[thinx-entrypoint] Adding host checking exception for github.com... can fail for the first time."
echo "140.82.121.3 github.com" >> /etc/hosts
ssh -tt -o "StrictHostKeyChecking=no" git@github.com

if [[ ! -z $ROLLBAR_ACCESS_TOKEN ]]; then
  if [[ -z $ROLLBAR_ENVIRONMENT ]]; then
    ROLLBAR_ENVIRONMENT="dev"
  fi
  LOCAL_USERNAME=$(whoami)
  echo "Starting Rollbar deploy..."
  curl --silent https://api.rollbar.com/api/1/deploy/ \
    -F access_token=$ROLLBAR_ACCESS_TOKEN \
    -F environment=$ROLLBAR_ENVIRONMENT \
    -F revision=$REVISION \
    -F local_username=$LOCAL_USERNAME 
    # > /dev/null
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
  curl -L https://codeclimate.com/downloads/test-reporter/test-reporter-latest-linux-amd64 > ./cc-test-reporter
  chmod +x ./cc-test-reporter
  # ./cc-test-reporter before-build
  echo "[thinx-entrypoint] TEST starting app as first run (create DB and stuff)..."
  #set +e # prevent exit on timeout - changed to make test fail when app is broken
  date
  timeout 120 node thinx.js # container must wait much longer for test to complete
  date
  #set -e # exit immediately on error
  echo "[thinx-entrypoint] TEST running suites..." 
  npm run test # | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
  bash <(curl -Ls https://coverage.codacy.com/get.sh) report --project-token ${CODACY_PROJECT_TOKEN}
  curl https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-4.6.2.2472-linux.zip -o sonar-scanner-cli-4.6.2.2472-linux.zip
  rm -rf ./sonar-scanner-cli-4.6.2.2472-linux
  7z x ./sonar-scanner-cli-4.6.2.2472-linux.zip
  export PATH=$PATH:$(pwd)/sonar-scanner-4.6.2.2472-linux/bin/
  sonar-scanner -Dsonar.login=${SONAR_TOKEN}
  rm -rf spec/test_repositories/**
  curl -Os https://uploader.codecov.io/latest/linux/codecov 
  chmod +x codecov
  ./codecov -t ${CODECOV_TOKEN}

  set -e
  
  if [[ -d ./.git ]]; then
    # currently fails with invalid request parameters, maybe should be replaced by cc-test-reporter
    codecov -t $CODECOV_TOKEN
  fi

else
  echo "[thinx-entrypoint] Starting in production mode..."
  # tee is used to split pipe with application logs back to file which
  # is observed by the app. this way the app can map own incidents in log-flow actively
  node thinx.js | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
fi
