#!/bin/bash

docker run --rm -ti -v `pwd`:/opt/nodemcu-firmware marcelstoer/nodemcu-build

# Options:
# You can pass the following optional parameters to the Docker build like so docker run -e "<parameter>=value" -e ....
# IMAGE_NAME The default firmware file names are nodemcu_float|integer_<branch>_<timestamp>.bin. If you define an image name it replaces the <branch>_<timestamp> suffix and the full image names become nodemcu_float|integer_<image_name>.bin.
# INTEGER_ONLY Set this to 1 if you don't need NodeMCU with floating support, cuts the build time in half.
# FLOAT_ONLY Set this to 1 if you only need NodeMCU with floating support, cuts the build time in half.
