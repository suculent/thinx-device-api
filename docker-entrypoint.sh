#!/bin/bash

#
# Section: Docker-in-Docker
#

# +e = prevents exit immediately if a command exits with a non-zero status (like StrictHostKeyChecking without a key...).

set +e

sysctl net.ipv4.ip_forward=1

export DOCKER_HOST="tcp://docker:2375"
export DOCKER_HOST="unix:///var/run/docker.sock"

# exec "$@"

source ~/.profile

# Installs all tools, not just those currently allowed by .dockerignore, requires running Docker
if [ ! -z $(which docker) ]; then
  echo "Installing Build-tools for DinD/DooD"
  pushd tools
  bash ./install-builders.sh
  popd
else
  echo "Skipping build-tools installation, Docker not available."
fi

echo "Adding host checking exception for github.com..."
ssh -o "StrictHostKeyChecking=no" git@github.com

echo "Deploying with Rollbar..."
if [[ ! -z $ROLLBAR_TOKEN ]]; then
  LOCAL_USERNAME=$(whoami)
  curl https://api.rollbar.com/api/1/deploy/ \
    -F access_token=$ROLLBAR_TOKEN \
    -F environment=$ROLLBAR_ENVIRONMENT \
    -F revision=$REVISION \
    -F local_username=$LOCAL_USERNAME
fi

echo "Starting..."
echo "LIST"
ls
echo "RUN"

# -e = exits immediately if a command exits with a non-zero status (like an exception that should be cause of a restart...).

set -e

# workaround for log aggregator until solved using event database
mkdir -p /opt/thinx/.pm2/logs/
touch /opt/thinx/.pm2/logs/index-out-1.log

node thinx.js | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
