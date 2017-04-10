#!/bin/bash

echo
echo "-=[ THiNX PLATFORMIO BUILDER ]=-"
echo

TENANT='test'
RUN=true
DEVICE='ANY'

# testing:
# ./build.sh --tenant=test --mac=ANY --git=https://github.com/suculent/thinx-firmware-esp8266 --dry-run

for i in "$@"
do
case $i in
    -t=*|--tenant=*)
      TENANT="${i#*=}"
    ;;
    -m=*|--mac=*)
      MAC="${i#*=}"
    ;;
    -g=*|--git=*)
      GIT_REPO="${i#*=}"
    ;;
    -d|--dry-run)
      RUN=false
    ;;
    *)
      # unknown option
    ;;
esac
done

DEPLOYMENT_PATH=/var/www/html/bin/$TENANT

# extract the protocol
proto="$(echo $GIT_REPO | grep :// | sed -e's,^\(.*://\).*,\1,g')"
# remove the protocol
url="$(echo ${GIT_REPO/$proto/})"
# extract the user (if any)
user="$(echo $url | grep @ | cut -d@ -f1)"
# extract the host
host="$(echo ${url/$user@/} | cut -d/ -f1)"
# by request - try to extract the port
port="$(echo $host | sed -e 's,^.*:,:,g' -e 's,.*:\([0-9]*\).*,\1,g' -e 's,[^0-9],,g')"
# extract the path (if any)
REPO_PATH="$(echo $url | grep / | cut -d/ -f2-)"
# extract the end of path (if any)
REPO_NAME="$(echo $url | grep / | cut -d/ -f3-)"

#echo "url: $url"
#echo "  proto: $proto"
#echo "  user: $user"
#echo "  host: $host"
#echo "  port: $port"
#echo "  path: $REPO_PATH"
#echo "  rname: $rname"

# echo "REPO_NAME: ${REPO_NAME}"

echo "Cleaning workspace..."

# Clean
rm -rf ./tenants/$TENANT/$REPO_NAME

# Create new working directory
mkdir -p ./tenants/$TENANT/$REPO_NAME

# TODO: only if $REPO_NAME contains slash(es)
pushd ./tenants/$TENANT > /dev/null

# Fetch project
git clone $GIT_REPO

pushd ./$REPO_PATH > /dev/null

COMMIT=$(git rev-parse HEAD)
echo "Fetched commit ID: ${COMMIT}"

# cd $REPO_NAME #

# TODO:
# process platformio.ini in order to set correct arduino library path
# search and adjust Thinx.h with current $COMMIT

# Build
echo

echo "Build step..."

if [ ! -f platformio.ini ]; then
	echo "This not a compatible project so far."
	echo "If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
	exit 1
fi

platformio run

echo

if [ $DRY ]; then

	echo "Dry run completed - skipping actual deployment."

else
		
	# Create user-referenced folder in public www space
	mkdir -p $DEPLOYMENT_PATH

	# Deploy binary (may require rotating previous file or timestamping/renaming previous version of the file)
	mv .pioenvs/d1_mini/firmware.elf $COMMIT.bin

	echo "Deploying $COMMIT.bin to $DEPLOYMENT_PATH..."	

	mv $COMMIT.bin $DEPLOYMENT_PATH	

	if [ $(uname) == "Darwin" ]; then
		open $DEPLOYMENT_PATH
	fi

	# TODO: send notification or create notification job

fi

popd > /dev/null
popd > /dev/null