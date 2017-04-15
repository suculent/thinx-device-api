#!/bin/bash

echo
echo "-=[ ☢ THiNX IoT RTM BUILDER ☢ ]=-"
echo

TENANT='test' 	# name of folder where workspaces reside
RUN=true		# dry-run switch
DEVICE='ANY'	# builds for any device by default
OPEN=false		# show build result in Finder
BUILD_ID=0

# tested:
# ./builder --tenant=test --mac=ANY --git=https://github.com/suculent/thinx-firmware-esp8266 --dry-run
# ./builder --tenant=test --mac=ANY --git=git@github.com:suculent/thinx-firmware-esp8266.git --dry-run

for i in "$@"
do
case $i in
	-i=*|--id=*)
      BUILD_ID="${i#*=}"
    ;;
    -t=*|--tenant=*)
      TENANT="${i#*=}"
    ;;
    -m=*|--mac=*)
      DEVICE="${i#*=}"
    ;;
    -a=*|--alias=*)
      DEVICE_ALIAS="${i#*=}"
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

VERSION=$(git rev-list HEAD --count)
echo "Version: ${VERSION}"

# Overwrite Thinx.h file (should be required)

THINX_FILE=$(find . | grep "/Thinx.h")
THINX_CLOUD_URL="thinx.cloud"
THINX_MQTT_URL="mqtt://${THINX_CLOUD_URL}"
THINX_OWNER=$TENANT

if [[ ! -z $DEVICE_ALIAS ]]; then
	THINX_ALIAS=$DEVICE_ALIAS
else
	THINX_ALIAS="vanilla"
fi

REPO_NAME=basename(pwd)
REPO_VERSION="0.3.${VERSION}" # todo: is not semantic at all, 0.3 should be recent git tag
BUILD_DATE=`date +%Y-%m-%d`

# TODO: Change this to a sed template, this is tedious

echo "//" > $THINX_FILE
echo "// This is an auto-generated file, it will be re-written by THiNX on cloud build." >> $THINX_FILE
echo "//" >> $THINX_FILE

echo "" >> $THINX_FILE

echo "static const String thinx_commit_id = \"${COMMIT}\";" >> $THINX_FILE
echo "static const String thinx_cloud_url = \"${THINX_CLOUD_URL}\";" >> $THINX_FILE
echo "static const String thinx_mqtt_url = \"${THINX_MQTT_URL}\";" >> $THINX_FILE
echo "static const String thinx_firmware_version = \"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\";" >> $THINX_FILE
echo "static const String app_version = "\"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\";" >> $THINX_FILE
echo "String thinx_owner = \"${THINX_OWNER}\";" >> $THINX_FILE
echo "String thinx_alias = \"${THINX_ALIAS}\";" >> $THINX_FILE
echo "String thinx_api_key = \"VANILLA_API_KEY\";;" >> $THINX_FILE # this just adds placeholder, key must not leak in binary...

echo "" >> $THINX_FILE

echo "WARNING: MQTT port is not parametrized.";
echo "int thinx_mqtt_port = 1883;" >> $THINX_FILE
echo "WARNING: API port is not parametrized here.";
echo "int thinx_api_port = 7442;" >> $THINX_FILE

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

SHA=0

if [[ $?==0 ]] ; then
	STATUS='"OK"'
	SHAX=$(shasum -a 256 .pioenvs/d1_mini/firmware.elf)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
else
	STATUS='"FAILED"'
fi

echo

if [[ $RUN==false ]]; then

	echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment."

	STATUS='"DRY_RUN_OK"'

else

	# Create user-referenced folder in public www space
	mkdir -p $DEPLOYMENT_PATH

	# Deploy binary (may require rotating previous file or timestamping/renaming previous version of the file)
	mv .pioenvs/d1_mini/firmware.elf $COMMIT.bin

	echo "Deploying $COMMIT.bin to $DEPLOYMENT_PATH..."

	mv $COMMIT.bin $DEPLOYMENT_PATH

	STATUS='"DEPLOYED"'

	if [ $(uname) == "Darwin" ]; then
		if $OPEN; then
			open $DEPLOYMENT_PATH
		fi
	fi
fi

echo $STATUS

popd > /dev/null
popd > /dev/null

DEPLOYMENT_PATH=$(echo ${DEPLOYMENT_PATH} | tr -d '/var/www/html')

CMD="${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${DEPLOYMENT_PATH}/${COMMIT}.bin ${DEVICE} ${SHA} ${TENANT} ${STATUS}"
echo $CMD
RESULT=$(node notifier.js $CMD)
echo $RESULT
