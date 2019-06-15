#!/bin/bash

# It would be better to traverse all *-docker-build directories in loop
# and docker pull just the basename

docker pull suculent/arduino-docker-build
docker pull suculent/platformio-docker-build
#docker pull suculent/micropython-docker-build
#docker pull suculent/mongoose-docker-build
#docker pull suculent/nodemcu-docker-build
