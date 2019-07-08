#!/bin/bash

# This is limited version for Enterprise release only, should skip rest if
# $ENTERPRISE==true instead of deleting the code.

################################################################################
# JavaScript/ECMAScript
#

set -e

npm install eslint

################################################################################
# C/C++
apt-get install cppcheck
# TODO: Use xtensa lx6 builder

echo "Tools installed."
