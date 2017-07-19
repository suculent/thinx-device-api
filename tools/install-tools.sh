################################################################################
# Docker Build: Mount EBS volume

sudo mount -o discard,defaults /dev/disk/by-id/scsi-0DO_Volume_thinx-docker-01 /var/lib/docker; echo /dev/disk/by-id/scsi-0DO_Volume_thinx-docker-01 /var/lib/docker ext4 defaults,nofail,discard 0 0 | sudo tee -a /etc/fstab

################################################################################
# LUA
git clone https://github.com/nodemcu/nodemcu-firmware.git
git clone https://github.com/davidm/lua-inspect

# ONCE docker pull suculent/nodemcu-docker-build

# Run from /tools/nodemcu-firmware where the firmware is fetched and possibly lua-modules extended with thinx
docker run --rm -ti -v `pwd`:/opt/nodemcu-firmware suculent/nodemcu-docker-build

# Options:
# You can pass the following optional parameters to the Docker build like so docker run -e "<parameter>=value" -e ....
# IMAGE_NAME The default firmware file names are nodemcu_float|integer_<branch>_<timestamp>.bin. If you define an image name it replaces the <branch>_<timestamp> suffix and the full image names become nodemcu_float|integer_<image_name>.bin.
# INTEGER_ONLY Set this to 1 if you don't need NodeMCU with floating support, cuts the build time in half.
# FLOAT_ONLY Set this to 1 if you only need NodeMCU with floating support, cuts the build time in half.

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
#docker build --force-rm --pull -t micropython .
#docker build --force-rm -t thinx-micropython .

#
# Freeze personal script files in the build
#

# If you want to add personal python scripts to include in the build flash image,
# you have to add them to the folder /micropython/esp8266/modules.
# The building process will precompiles your scripts with MPY and will inserts
# in the flash image this option will save you more memory of the MCU.

# To obtain this within the docker container, create a copy of the original
# micropython folder /micropython/esp8266/modules in your working directrory
# add here your scripts and link them into the container (with the -v docker
# option) overriding the default modules folder, when you run the container.

docker run --rm -it -v $(pwd)/modules:/micropython/esp8266/modules --workdir /micropython/esp8266 ${DOCKER_IMAGE_NAME} /bin/bash
# docker run --rm -it -v $(pwd)/modules:/micropython/esp8266/modules --workdir /micropython/esp8266 fcollova/micropython-docker-build /bin/bash
rm -rf ./build; make clean; make
make V=1 # verbose make


# Insert customizations into /micropython/esp8266/modules

mkdir -p /micropython/esp8266/modules # Should update Dockerfile to change this
pushd /micropython/esp8266/modules
git clone https://github.com/suculent/thinx-firmware-esp8266-upy.git
popd

docker build -t micropython . # Build the docker image of the master branch. Specify version with  --build-arg VERSION=v1.8.7 .


# FW-ONLY: git clone https://github.com/micropython/micropython.git
# FROM: https://hub.docker.com/r/fcollova/micropython-docker-build/

docker run --rm -it -v $(pwd)/modules:/micropython/esp8266/modules --workdir /Users/sychram/Repositories/thinx-device-api/tools/micropython/esp8266 micropython /bin/bash


# MongooseOS
curl -fsSL https://mongoose-os.com/downloads/mos/install.sh | /bin/bash

# Clean up dead and exited containers using command:
docker volume ls -qf dangling=true | xargs -r docker volume rm
docker ps --filter status=dead --filter status=exited -aq | xargs docker rm -v
