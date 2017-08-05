#!/bin/bash

# It would be better to traverse all *-docker-build directories in loop
# and docker pull just the basename

#pushd ./arduino-docker-build
#git pull origin master
docker pull suculent/arduino-docker-build
#popd
    
#pushd ./platformio-docker-build
#git pull origin master
docker pull suculent/platformio-docker-build
#popd
    
#pushd ./micropython-docker-build
#git pull origin master
docker pull suculent/micropython-docker-build
#popd
    
#pushd ./mongoose-docker-build
#git pull origin master
docker pull suculent/mongoose-docker-build
#popd
    
#pushd ./nodemcu-docker-build
#git pull origin master
docker pull suculent/nodemcu-docker-build
#popd