#!/bin/bash

set +e

sysctl net.ipv4.ip_forward=1

export DOCKER_HOST="tcp://docker:2375"
export DOCKER_HOST="unix:///var/run/docker.sock"

source ~/.profile

# Installs all tools, not just those currently allowed by .dockerignore, requires running Docker
if [ ! -z $(which docker) ]; then
  echo "Installing Build-tools for DinD/DooD"
  pushd tools
  bash ./install-builders.sh
  bash ./install-tools.sh
  popd
else
  echo "Skipping build-tools installation, Docker not available."
fi

ssh -o "StrictHostKeyChecking=no" git@github.com

if [ ! -z ROLLBAR_TOKEN ]; then
  LOCAL_USERNAME=$(whoami)
  curl https://api.rollbar.com/api/1/deploy/ \
    -F access_token=$ROLLBAR_TOKEN \
    -F environment=$ROLLBAR_ENVIRONMENT \
    -F revision=$REVISION \
    -F local_username=$LOCAL_USERNAME
fi

set -e

# workaround for log aggregator until solved using event database
mkdir -p /opt/thinx/.pm2/logs/
touch /opt/thinx/.pm2/logs/index-out-1.log
node thinx.js | tee -ipa /opt/thinx/.pm2/logs/index-out-1.log
