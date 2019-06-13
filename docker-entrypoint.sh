#!/bin/bash

#
# Section: Docker-in-Docker
#

set -e

export DOCKER_HOST="tcp://0.0.0.0:2375"

if [ "$#" -eq 0 ] || [ "${1#-}" != "$1" ]; then
	set -- dockerd \
		--host=unix:///var/run/docker.sock \
		--host=tcp://0.0.0.0:2375 \
		"$@"
fi
if [ "$1" = 'dockerd' ]; then
	if [ -x '/usr/local/bin/dind' ]; then
		set -- '/usr/local/bin/dind' "$@"
	fi
	find /run /var/run -iname 'docker*.pid' -delete
fi

# exec "$@"

#
# Section: THiNX/NVM
#

source ~/.profile
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm


#
# Firmware Builders
#

# Installs all tools, not just those currently allowed by .dockerignore, requires running Docker
if [ ! -z $(which docker) ]; then
  set +e
  echo "Installing Build-tools for DinD/DooD"
  pushd tools
  bash ./install-builders.sh
  bash ./install-tools.sh
  popd
  set -e
else
  echo "Skipping build-tools installation, Docker not available."
fi


#
# Device API
#

set +e

echo "Trying to find pm2 before starting from absolute path..."

which pm2

/root/.nvm/versions/node/v11.13.0/bin/pm2 start ecosystem.json

#
# Section: Rollbar Deployment Success Notice
#

set -e

if [ ! -z ROLLBAR_TOKEN ]; then
  LOCAL_USERNAME=$(whoami)
  curl https://api.rollbar.com/api/1/deploy/ \
    -F access_token=$ROLLBAR_TOKEN \
    -F environment=$ROLLBAR_ENVIRONMENT \
    -F revision=$REVISION \
    -F local_username=$LOCAL_USERNAME
fi

#
# Section: PM2
#

pm2 logs -f
