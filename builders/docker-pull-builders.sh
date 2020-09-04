#!/bin/bash

# Docker will pull those automatically when requested; this is used just for pre-pulling required components

set -e

docker pull suculent/arduino-docker-build
docker pull suculent/platformio-docker-build
docker pull suculent/micropython-docker-build
docker pull suculent/mongoose-docker-build
docker pull suculent/nodemcu-docker-build

echo "Builders updated."
