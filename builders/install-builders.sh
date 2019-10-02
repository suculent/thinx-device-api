#!/bin/bash

# Docker will pull those automatically when requested; disabled for faster testing

echo "Skipping Builder Pre-install... will be pulled when needed."

exit 0

# It would be better to traverse all *-docker-build directories in loop
# and docker pull just the basename

set -e

docker pull suculent/arduino-docker-build
docker pull suculent/platformio-docker-build
docker pull suculent/micropython-docker-build
docker pull suculent/mongoose-docker-build
docker pull suculent/nodemcu-docker-build

echo "Builders installed."
