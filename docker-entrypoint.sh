#!/bin/sh

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
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASS}@couchdb:5984/_users > $DEVNULL
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASS}@couchdb:5984/_replicator > $DEVNULL
curl -s -X PUT http://${COUCHDB_USER}:${COUCHDB_PASS}@couchdb:5984/_global_changes > $DEVNULL

export SQREEN_DISABLE_STARTUP_WARNING=1

export DOCKER_HOST="tcp://docker:2375"
export DOCKER_HOST="unix:///var/run/docker.sock"

if [ -f ~/.ssh/id_rsa ]; then
  echo "[thinx-entrypoint] Adding host checking exception for github.com..."
  echo "140.82.121.3 github.com" >> /etc/hosts
  ssh -T -o "StrictHostKeyChecking=no" git@github.com || true
fi

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

if [[ ${ENVIRONMENT} == "test" ]]; then
  # WARNING: this SKIPS the entire ZZ-* integration tier in CI.
  #
  # split-tests shards by CIRCLE_NODE_INDEX, but .circleci/config.yml sets
  # `parallelism: 1`, so the index is always 0 — the branch that deletes
  # ./spec/jasmine/ZZ*.js. Index 1 never runs. That has silently skipped
  # ~393 specs (SEC-COOKIE-01, OAUTH-COOKIE-01, the router/device/transfer
  # suites) since d7f0aaa1 reverted parallelism to 1 on 2026-03-14.
  #
  # Removing this line was tried on 3f9f6df3 and had to be reverted: with the
  # tier enabled, the CI test step ran past CircleCI's 60-minute job limit and
  # timed out (pipeline f2bccabc), blocking build-api-cloud. A local run of the
  # same suite finishes in ~10 minutes with 186/797 failing, so the tier needs
  # triage AND a CI hang investigated before it can be switched on.
  #
  # Re-enable by deleting this line — but fix the hang and the failures first.
  npm run split-tests
  npm run test
else
  echo "[thinx-entrypoint] Starting in production mode..."
  # tee is used to split pipe with application logs back to file which
  # is observed by the app. this way the app can map own incidents in log-flow actively
  node --trace-warnings thinx.js
fi
