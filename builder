#!/bin/bash

set +e

echo
echo "[builder.sh] -=[ ☢ THiNX IoT RTM BUILDER ☢ ]=-"
echo "[builder.sh] -=[ ☢ THiNX IoT RTM BUILDER ☢ ]=-" >> $LOG_PATH
echo >> $LOG_PATH

echo "[builder.sh] Running from: $(pwd)"

# FIXME: This is system environment variable and should be configured on installation,
# or injected by build class from Node.js

if [[ -z $THINX_WEB_ROOT ]]; then
		THINX_WEB_ROOT='/var/www/html/bin'
		echo "Setting THINX_WEB_ROOT env var to default ${THINX_WEB_ROOT}"
fi

OWNER_ID='18ea285983df355f3024e412fb46ad6cbd98a7ffe6872e26612e35f38aa39c41' 		# name of folder where workspaces reside
RUN=true			# dry-run switch
DEVICE='UNKNOWN'	# builds for no device by default, not even ANY
OPEN=false			# show build result in Finder
BUILD_ID='test-build-id'
ORIGIN=$(pwd)
UDID='f8e88e40-43c8-11e7-9ad3-b7281c2b9610'

# ./builder --id=test-build-id --owner=18ea285983df355f3024e412fb46ad6cbd98a7ffe6872e26612e35f38aa39c41 --udid=a80cc610-4faf-11e7-9a9c-41d4f7ab4083 --git=git@github.com:suculent/thinx-firmware-esp8266.git

for i in "$@"
do
case $i in
	  -i=*|--id=*)
      BUILD_ID="${i#*=}"
    ;;
    -o=*|--owner=*)
      OWNER_ID="${i#*=}"
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
    --open)
      OPEN=true
    ;;
		-u=*|--udid=*)
		    UDID="${i#*=}"
		;;
    *)
      # unknown option
    ;;
esac
done

THINX_ROOT=$(pwd)
echo "[builder.sh] Starting builder at path ${THINX_ROOT}"

OWNER_ID_HOME=$THINX_ROOT/data/$OWNER_ID
echo "[builder.sh] Owner workspace: ${OWNER_ID_HOME}"

DEPLOYMENT_PATH=$OWNER_ID_HOME/$UDID/$BUILD_ID
DISPLAY_DEPLOYMENT_PATH=$(echo ${DEPLOYMENT_PATH} | tr -d '$THINX_WEB_ROOT')
echo "[builder.sh] Making deployment path: ${DISPLAY_DEPLOYMENT_PATH}"

# Create user-referenced folder in public www space
mkdir -p $OWNER_ID_HOME
mkdir -p $DEPLOYMENT_PATH

LOG_PATH="${DEPLOYMENT_PATH}/${BUILD_ID}.log"
echo "[builder.sh] Log path: $LOG_PATH"
touch $LOG_PATH
echo "[builder.sh] Starting builder at path ${THINX_ROOT}" >> $LOG_PATH
echo "[builder.sh] Owner workspace: ${OWNER_ID_HOME}" >> $LOG_PATH
echo "[builder.sh] Making deployment path: ${DISPLAY_DEPLOYMENT_PATH}" >> $LOG_PATH

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

echo "[builder.sh]   url: $url" >> $LOG_PATH
echo "[builder.sh]   proto: $proto" >> $LOG_PATH
echo "[builder.sh]   user: $user" >> $LOG_PATH
echo "[builder.sh]   host: $host" >> $LOG_PATH
echo "[builder.sh]   port: $port" >> $LOG_PATH
echo "[builder.sh]   REPO_PATH: $REPO_PATH" >> $LOG_PATH
echo "[builder.sh]   REPO_NAME: ${REPO_NAME}" >> $LOG_PATH

echo "[builder.sh] Cleaning workspace..."

# Clean
rm -rf $THINX_ROOT/tenants/$OWNER_ID/$UDID/$BUILD_ID/$REPO_PATH/**

# TODO: only if $REPO_NAME contains slash(es)
OWNER_PATH=$THINX_ROOT/repositories/$OWNER_ID/$UDID/$BUILD_ID
if [[ ! -d $OWNER_PATH ]]; then
	mkdir -p $OWNER_PATH
fi

echo "[builder.sh] Entering owner folder $OWNER_PATH"
pushd $OWNER_PATH > /dev/null

# Create new working directory
echo "[builder.sh] Creating new working directory $REPO_PATH"
mkdir -p ./$REPO_PATH

ls

# enter git user folder if any
if [[ -d $GIT_USER ]]; then
	echo "[builder.sh][DEBUG] Entering git user folder inside workspace ./${GIT_USER}..."
	pushd $GIT_USER > /dev/null
fi

# Clean workspace
echo "[builder.sh] Cleaning previous git repository / workspace in $REPO_NAME..."
rm -rf $REPO_NAME

echo "[builder.sh] Cloning ${GIT_REPO}..." >> $LOG_PATH
# Fetch project
git clone $GIT_REPO


if [[ -d $REPO_NAME ]]; then
	pushd ./$REPO_NAME
else
	pushd ./$REPO_PATH
fi

if [[ ! -d .git ]]; then
	echo "Not a GIT repository: $(pwd)" >> $LOG_PATH
fi

COMMIT=$(git rev-parse HEAD)
echo "[builder.sh] Fetched commit ID: ${COMMIT}" >> $LOG_PATH

VERSION=$(git rev-list HEAD --count)
echo "[builder.sh] Repository version/revision: ${VERSION}" >> $LOG_PATH

# Overwrite Thinx.h file (should be required)

echo "Seaching THiNX-File in ${OWNER_PATH}..." >> $LOG_PATH

echo $(pwd)

THINX_FILE="$(find ${OWNER_PATH} | grep '/thinx.h')"

if [[ -z $THINX_FILE ]]; then
	echo "No THiNX-File found!" >> $LOG_PATH
	exit 1 # will deprecate on modularization for more platforms
else
	echo "Found THiNX-File: ${THINX_FILE}" >> $LOG_PATH
fi

THINX_CLOUD_URL="thinx.cloud"
THINX_MQTT_URL="mqtt://${THINX_CLOUD_URL}"

if [[ ! -z $DEVICE_ALIAS ]]; then
	THINX_ALIAS=$DEVICE_ALIAS
else
	THINX_ALIAS="vanilla"
fi

THX_VERSION="$(git describe --abbrev=0 --tags)"
if [[ $? > 0 ]]; then
	THX_VERSION="1.0"
fi

REPO_NAME="$(basename $(pwd))"
REPO_VERSION="${THX_VERSION}.${VERSION}" # todo: is not semantic at all
BUILD_DATE=`date +%Y-%m-%d`

# TODO: Change this to a sed template, this is tedious

echo "[builder.sh] Building Thinx.h..." >> $LOG_PATH

echo "//" > "${THINX_FILE}"
echo "// This is an auto-generated file, it will be re-written by THiNX on cloud build." >> "${THINX_FILE}"
echo "//" >> "${THINX_FILE}"
echo "" >> "${THINX_FILE}"
echo "// build-time constants" >> "${THINX_FILE}"
echo "#define THINX_COMMIT_ID \"${COMMIT}\"" >> "${THINX_FILE}"
echo "#define THINX_MQTT_URL \"${THINX_MQTT_URL}\"" >> "${THINX_FILE}"
echo "#define THINX_CLOUD_URL \"${THINX_CLOUD_URL}\"" >> "${THINX_FILE}"
echo "#define THINX_FIRMWARE_VERSION \"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\"" >> "${THINX_FILE}"
echo "#define THINX_FIRMWARE_VERSION_SHORT \"${REPO_VERSION}\"" >> "${THINX_FILE}"
echo "#define THINX_APP_VERSION \"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\"" >> "${THINX_FILE}"
echo "" >> "${THINX_FILE}"
echo "// dynamic variables" >> "${THINX_FILE}"
echo "#define THINX_ALIAS \"${THINX_ALIAS}\"" >> "${THINX_FILE}"
echo "#define THINX_API_KEY \"VANILLA_API_KEY\"" >> "${THINX_FILE}" # this just adds placeholder, key must not leak in binary...
echo "#define THINX_OWNER \"${OWNER_ID}\"" >> "${THINX_FILE}"

echo "" >> "${THINX_FILE}"
echo "#define THINX_MQTT_PORT 1883" >> "${THINX_FILE}"
echo "#define THINX_API_PORT 7442" >> "${THINX_FILE}"
echo "" >> "${THINX_FILE}"
echo "#define THINX_UDID \"${UDID}\"" >> "${THINX_FILE}" # this just adds placeholder, key should not leak

# Build
echo "[builder.sh] Finished building Thinx.h" >> $LOG_PATH
cat $THINX_FILE >> $LOG_PATH

echo "[builder.sh] TODO: Support no-compile deployment of Micropython/LUA here..."

if [[ -f package.json ]]; then
	echo "[builder.sh] THiNX does not support npm builds." >> $LOG_PATH
	echo "[builder.sh] If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues" >> $LOG_PATH

elif [[ ! -f platformio.ini ]]; then
	echo "[builder.sh] This not a compatible project so far. Cannot build Arduino project without importing to Platform.io first." >> $LOG_PATH
	echo "[builder.sh] If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues" >> $LOG_PATH
	exit 1
fi

echo "[builder.sh] Build step..."

platformio run >> $LOG_PATH

SHA=0

if [[ $?==0 ]] ; then
	STATUS='"OK"'
	SHAX=$(shasum -a 256 .pioenvs/d1_mini/firmware.bin)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
else
	STATUS='"BUILD FAILED."'
fi

if [[ ! ${RUN} ]]; then
	echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." >> $LOG_PATH
	STATUS='"DRY_RUN_OK"'
else

	echo "[builder.sh] TODO: Support post-build deployment of different platforms here..."

	# Deploy binary (may require rotating previous file or timestamping/renaming previous version of the file)
	 # WARNING: bin was elf here but it seems kind of wrong. needs testing

	# platform-dependent:
	BUILD_ARTIFACT=".pioenvs/d1_mini/firmware.bin"

	if [[ -f ${BUILD_ARTIFACT} ]]; then
		cp ${BUILD_ARTIFACT} ${BUILD_ID}.bin
		echo "[builder.sh] Deploying $BUILD_ID.bin to $DEPLOYMENT_PATH..."
		mv ${BUILD_ID}.bin ${DEPLOYMENT_PATH}
		STATUS='"DEPLOYED"'
		if [[ $(uname) == "Darwin" ]]; then
			if [[ $OPEN ]]; then
				open $DEPLOYMENT_PATH
			fi
		fi
	else
		STATUS='"BUILD FAILED."'
	fi
fi

echo "[builder.sh] Build completed with status: $STATUS" >> $LOG_PATH

popd
popd

echo "[builder.sh] Post-flight check:" >> $LOG_PATH

echo "DP" $DISPLAY_DEPLOYMENT_PATH >> $LOG_PATH

echo "BUILD_ID" "${BUILD_ID}" >> $LOG_PATH
echo "COMMIT" "${COMMIT}" >> $LOG_PATH
echo "VERSION" "${VERSION}" >> $LOG_PATH
echo "GIT_REPO" "${GIT_REPO}" >> $LOG_PATH
echo "DEPLOYMENT_PATH" "${DEPLOYMENT_PATH}" >> $LOG_PATH
echo "UDID" "${UDID}" >> $LOG_PATH
echo "SHA" "${SHA}" >> $LOG_PATH
echo "OWNER_ID" "${OWNER_ID}" >> $LOG_PATH
echo "STATUS" "${STATUS}" >> $LOG_PATH

echo "[THiNX] Log path: $LOG_PATH" >> $LOG_PATH

#cat $LOG_PATH

# Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope (or stores into DB later)
CMD="${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${DEPLOYMENT_PATH}/${BUILD_ID}.bin ${UDID} ${SHA} ${OWNER_ID} ${STATUS}"
echo $CMD >> $LOG_PATH
pushd $ORIGIN # go back to application root folder
RESULT=$(node $THINX_ROOT/notifier.js $CMD)
echo -e "${RESULT}"
echo -e "${RESULT}" >> $LOG_PATH

# Upgrade Platformio in case new version is available
if [[ $RESULT=="*platformio upgrade*" ]]; then
		echo "Auto-updating platformio..."
		platformio upgrade
fi

echo "Done." >> $LOG_PATH
echo "Done."

set -e
