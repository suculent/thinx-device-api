#!/bin/bash

echo
echo "-=[ ☢ THiNX IoT RTM BUILDER ☢ ]=-"
echo

TENANT='test' 	# name of folder where workspaces reside
RUN=true		# dry-run switch
DEVICE='ANY'	# builds for any device by default
OPEN=false		# show build result in Finder

# tested:
# ./builder --tenant=test --mac=ANY --git=https://github.com/suculent/thinx-firmware-esp8266 --dry-run
# ./builder --tenant=test --mac=ANY --git=git@github.com:suculent/thinx-firmware-esp8266.git --dry-run

for i in "$@"
do
case $i in
    -t=*|--tenant=*)
      TENANT="${i#*=}"
    ;;
    -m=*|--mac=*)
      DEVICE="${i#*=}"
    ;;
    -g=*|--git=*)
      GIT_REPO="${i#*=}"
    ;;
    -d|--dry-run)
      RUN=false
    ;;
    -o|--open)
      OPEN=true
    ;;
    *)
      # unknown option
    ;;
esac
done

DEPLOYMENT_PATH=/var/www/html/bin/$TENANT

# deploy to device folder if assigned
if [ "${DEVICE}" != "ANY" ];  then
	DEPLOYMENT_PATH=${DEPLOYMENT_PATH}/${DEVICE}
fi

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

#echo "REPO_PATH: ${REPO_PATH}"

if [[ "$user" == "git" ]]; then
	proto="git-ssl"
	len=${#REPO_NAME}
	OLDHOST=$host
	host="$(echo $OLDHOST | grep : | cut -d: -f2-)"
	GIT_USER=$(echo $OLDHOST | grep : | cut -d: -f2-)
	#echo "GIT_USER: ${GIT_USER}"
	GIT_PATH=$REPO_PATH
	REPO_PATH="${GIT_USER}/$(sed 's/.git//g' <<< $GIT_PATH)"	
	REPO_NAME="$(echo $REPO_PATH | grep / | cut -d/ -f2-)"
fi

#echo "url: $url"
#echo "  proto: $proto"
#echo "  user: $user"
#echo "  host: $host"
#echo "  port: $port"
#echo "  REPO_PATH: $REPO_PATH"
#echo "  REPO_NAME: ${REPO_NAME}"

echo "Cleaning workspace..."

# Clean
rm -rf ./tenants/$TENANT/$REPO_PATH

# Create new working directory
mkdir -p ./tenants/$TENANT/$REPO_PATH

# TODO: only if $REPO_NAME contains slash(es)
pushd ./tenants/$TENANT > /dev/null

# enter git user folder if any
if [[ -d ${GIT_USER} ]]; then
	pushd ${GIT_USER}
fi

# Fetch project
git clone $GIT_REPO

if [[ -d $REPO_NAME ]]; then
	pushd ./$REPO_NAME > /dev/null
else
	pushd ./$REPO_PATH > /dev/null
fi

COMMIT=$(git rev-parse HEAD)
echo "Fetched commit ID: ${COMMIT}"

#cd $REPO_NAME #

# TODO:
# process platformio.ini in order to set correct arduino library path
# search and adjust Thinx.h with current $COMMIT

# Build
echo

echo "Build step..."

if [[ -f package.json ]]; then
	echo
	echo "THiNX does not support npm builds."
	echo "If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
	exit 0

elif [[ ! -f platformio.ini ]]; then
	echo
	echo "This not a compatible project so far."
	echo "If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
	exit 1
fi

platformio run

echo

if [[ $RUN==false ]]; then

	echo "Dry run completed - skipping actual deployment."

else
		
	# Create user-referenced folder in public www space
	mkdir -p $DEPLOYMENT_PATH

	# Deploy binary (may require rotating previous file or timestamping/renaming previous version of the file)
	mv .pioenvs/d1_mini/firmware.elf $COMMIT.bin

	echo "Deploying $COMMIT.bin to $DEPLOYMENT_PATH..."	

	mv $COMMIT.bin $DEPLOYMENT_PATH	

	if [ $(uname) == "Darwin" ]; then
		if $OPEN; then
			open $DEPLOYMENT_PATH
		fi
	fi

	# TODO: send notification or create notification job

fi

popd > /dev/null
popd > /dev/null