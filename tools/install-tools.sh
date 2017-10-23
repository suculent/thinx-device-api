#!/bin/bash

################################################################################
# Docker Build: Mount EBS volume

sudo mount -o discard,defaults /dev/disk/by-id/scsi-0DO_Volume_thinx-docker-01 /var/lib/docker; echo /dev/disk/by-id/scsi-0DO_Volume_thinx-docker-01 /var/lib/docker ext4 defaults,nofail,discard 0 0 | sudo tee -a /etc/fstab

# Clean up dead and exited containers using command:
docker volume ls -qf dangling=true | xargs -r docker volume rm
docker ps --filter status=dead --filter status=exited -aq | xargs docker rm -v


################################################################################
# Lua
git clone https://github.com/suculent/nodemcu-firmware.git
git clone https://github.com/davidm/lua-inspect
docker pull suculent/nodemcu-docker-build

# Run from /tools/nodemcu-firmware where the firmware is fetched and possibly lua-modules extended with thinx
# docker run --rm -ti -v `pwd`:/opt/nodemcu-firmware suculent/nodemcu-docker-build

################################################################################
# JavaScript/ECMAScript
#

npm install eslint

################################################################################
# C/C++
sudo apt-get install cppcheck
# TODO: Use xtensa lx6 builder

################################################################################
# Micropython
pip install pylama

docker pull suculent/micropython-docker-build # Docker Pull Command; takes a while but should be done once the repo changes only.

export DOCKER_IMAGE_NAME=thinx-micropython

# based on suculent/micropython-docker-build

cd tools
git clone https://github.com/suculent/micropython-docker-build.git
pushd micropython-docker-build
mkdir -p ./modules
pushd ./modules
git clone https://github.com/suculent/thinx-firmware-esp8266-upy.git
mv ./thinx-firmware-esp8266-upy/boot.py ./boot.py
rm -rf thinx-firmware-esp8266-upy
popd
docker build --force-rm -t ${DOCKER_IMAGE_NAME} .

# docker run --rm -it -v $(pwd)/modules:/micropython/esp8266/modules --workdir /Users/sychram/Repositories/thinx-device-api/tools/micropython/esp8266 micropython /bin/bash

################################################################################
# MongooseOS
curl -fsSL https://mongoose-os.com/downloads/mos/install.sh | /bin/bash
