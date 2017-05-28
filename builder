#!/bin/bash

echo
echo "[THiNX] -=[ ☢ THiNX IoT RTM BUILDER ☢ ]=-"
echo

echo "[THiNX] Running from: $(pwd)"

# FIXME: This is system environment variable and should be configured on installation,
# or injected by build class from Node.js

if [[ -z $THINX_WEB_ROOT ]]; then
		THINX_WEB_ROOT='/var/www/html/bin'
fi

OWNER_ID='eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f' 		# name of folder where workspaces reside
RUN=true			# dry-run switch
DEVICE='UNKNOWN'	# builds for no device by default, not even ANY
OPEN=false			# show build result in Finder
BUILD_ID='test-build-id'
ORIGIN=$(pwd)
UDID='f8e88e40-43c8-11e7-9ad3-b7281c2b9610'

# ./builder --id=test-build-id --owner=eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f --udid=f8e88e40-43c8-11e7-9ad3-b7281c2b9610 --git=git@github.com:suculent/thinx-firmware-esp8266.git

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
		-u|--udid)
		    UDID="${i#*=}"
		;;
    *)
      # unknown option
    ;;
esac
done

THINX_ROOT=$(pwd)
echo "[THiNX] Starting builder at path ${THINX_ROOT}"

OWNER_ID_HOME=$THINX_ROOT/data/$OWNER_ID/$BUILD_ID
echo "[THiNX] Owner workspace: ${OWNER_ID_HOME}"

DEPLOYMENT_PATH=$THINX_WEB_ROOT/$OWNER_ID_HOME/$UDID
DISPLAY_DEPLOYMENT_PATH=$(echo ${DEPLOYMENT_PATH} | tr -d '$THINX_WEB_ROOT')
echo "[THiNX] Making deployment path: ${DISPLAY_DEPLOYMENT_PATH}"

# Create user-referenced folder in public www space
set +e
mkdir -p $OWNER_ID_HOME
mkdir -p $DEPLOYMENT_PATH
set -e

LOG_PATH="${DEPLOYMENT_PATH}${BUILD_ID}.log"

echo "[THiNX] Created deployment/log path..."

echo $LOG_PATH
echo "[THiNX] Log path: $LOG_PATH"


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

echo "[THiNX]   url: $url"
echo "[THiNX]   proto: $proto"
echo "[THiNX]   user: $user"
echo "[THiNX]   host: $host"
echo "[THiNX]   port: $port"
echo "[THiNX]   REPO_PATH: $REPO_PATH"
echo "[THiNX]   REPO_NAME: ${REPO_NAME}"

echo

echo "[THiNX] Cleaning workspace..."

# Clean
rm -rf ./tenants/$OWNER_ID/$UDID/$BUILD_ID/$REPO_PATH/**

echo "[THiNX] Creating workspace..."

# TODO: only if $REPO_NAME contains slash(es)
OWNER_PATH=./tenants/$OWNER_ID/$UDID/$BUILD_ID
if [[ ! -d $OWNER_PATH ]]; then
	mkdir -p $OWNER_PATH
fi

echo "[THiNX]Entering owner folder $OWNER_PATH"
pushd $OWNER_PATH

# Create new working directory
echo "[THiNX]Creating new working directory $REPO_PATH"
mkdir -p ./$REPO_PATH

# enter git user folder if any
if [[ -d $GIT_USER ]]; then
	echo "[THINX][DEBUG] Entering git user folder!!!"
	pushd $GIT_USER
fi

# Clean workspace
echo "[THiNX] Cleaning repository path..."
rm -rf $REPO_NAME

# Fetch project
git clone $GIT_REPO

if [[ -d $REPO_NAME ]]; then
	pushd ./$REPO_NAME
else
	pushd ./$REPO_PATH
fi

COMMIT=$(git rev-parse HEAD)
echo "[THiNX] Fetched commit ID: ${COMMIT}"

VERSION=$(git rev-list HEAD --count)
echo "[THiNX] Repository version/revision: ${VERSION}"

# Overwrite Thinx.h file (should be required)

THINX_FILE="$(find . | grep '/Thinx.h')"
THINX_CLOUD_URL="thinx.cloud"
THINX_MQTT_URL="mqtt://${THINX_CLOUD_URL}"
THINX_OWNER=$OWNER_ID

if [[ ! -z $DEVICE_ALIAS ]]; then
	THINX_ALIAS=$DEVICE_ALIAS
else
	THINX_ALIAS="vanilla"
fi

THX_VERSION="$(git describe --abbrev=0 --tags)"
REPO_NAME="$(basename $(pwd))"
REPO_VERSION="${THX_VERSION}.${VERSION}" # todo: is not semantic at all
BUILD_DATE=`date +%Y-%m-%d`

# TODO: Change this to a sed template, this is tedious

echo "[THiNX] Building Thinx.h..."
echo

echo "//" > $THINX_FILE
echo "// This is an auto-generated file, it will be re-written by THiNX on cloud build." >> $THINX_FILE
echo "//" >> $THINX_FILE
echo "" >> $THINX_FILE
echo "// build-time constants" >> $THINX_FILE
echo "static const String thinx_commit_id = \"${COMMIT}\";" >> $THINX_FILE
echo "static const String thinx_mqtt_url = \"${THINX_MQTT_URL}\";" >> $THINX_FILE
echo "static const String thinx_cloud_url = \"${THINX_CLOUD_URL}\";" >> $THINX_FILE
echo "static const String thinx_firmware_version = \"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\";" >> $THINX_FILE
echo "static const String thinx_firmware_version_short = \"${REPO_VERSION}\";" >> $THINX_FILE
echo "static const String app_version = \"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\";" >> $THINX_FILE
echo "" >> $THINX_FILE
echo "// dynamic variables" >> $THINX_FILE
echo "String thinx_alias = \"${THINX_ALIAS}\";" >> $THINX_FILE
echo "String thinx_api_key = \"VANILLA_API_KEY\";" >> $THINX_FILE # this just adds placeholder, key must not leak in binary...
echo "String thinx_owner = \"${THINX_OWNER}\";" >> $THINX_FILE
echo "String thinx_udid = \"${UDID}\";" >> $THINX_FILE # this just adds placeholder, key should not leak
echo "" >> $THINX_FILE
echo "int thinx_mqtt_port = 1883;" >> $THINX_FILE
echo "int thinx_api_port = 7442;" >> $THINX_FILE


# Build
echo
echo "[THiNX] Generated header file Thinx.h:"
cat $THINX_FILE >> $LOG_PATH
echo

echo "[THiNX] TODO: Support no-compile deployment of Micropython/LUA here..."

if [[ -f package.json ]]; then
	echo
	echo "[THiNX] THiNX does not support npm builds."
	echo "[THiNX] If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"

elif [[ ! -f platformio.ini ]]; then
	echo
	echo "[THiNX] This not a compatible project so far. Cannot build Arduino project without importing to Platform.io first."
	echo "[THiNX] If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
	exit 1
fi

echo "[THiNX] Build step..."

platformio run >> $LOG_PATH

SHA=0

if [[ $?==0 ]] ; then
	STATUS='"OK"'
	SHAX=$(shasum -a 256 .pioenvs/d1_mini/firmware.bin)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
else
	STATUS='"BUILD FAILED."'
fi

echo

if [[ ! ${RUN} ]]; then
	echo "[THiNX] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment."
	STATUS='"DRY_RUN_OK"'
else

	echo "[THiNX] TODO: Support post-build deployment of different platforms here..."

	# Deploy binary (may require rotating previous file or timestamping/renaming previous version of the file)
	 # WARNING: bin was elf here but it seems kind of wrong. needs testing

	# platform-dependent:
	BUILD_ARTIFACT=".pioenvs/d1_mini/firmware.bin"

	if [[ -f ${BUILD_ARTIFACT} ]]; then
		mv ${BUILD_ARTIFACT} "${COMMIT}.bin"
		echo "[THiNX] Deploying $COMMIT.bin to $DEPLOYMENT_PATH..."
		mv $COMMIT.bin $DEPLOYMENT_PATH
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

echo "[THiNX] Build completed with status: $STATUS"

popd
popd

echo

echo "[THiNX] Post-flight check:"

echo "DP" $DISPLAY_DEPLOYMENT_PATH

echo "BID" "${BUILD_ID}"
echo "CID" "${COMMIT}"
echo "VER" "${VERSION}"
echo "GIT" "${GIT_REPO}"
echo "DEP" "${DEPLOYMENT_PATH}"
echo "UDID" "${UDID}"
echo "SHA" "${SHA}"
echo "TNT" "${OWNER_ID}"
echo "STA" "${STATUS}"

cd $ORIGIN

echo "[THiNX] Log path: $LOG_PATH"
cat $LOG_PATH

# Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope (or stores into DB later)
CMD="${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${DEPLOYMENT_PATH}/${COMMIT}.bin ${UDID} ${SHA} ${OWNER_ID} ${STATUS}"
echo $CMD
RESULT=$(node notifier.js $CMD)
echo -e "${RESULT}"
echo -e "${RESULT}" > $LOG_PATH

# Upgrade Platformio in case new version is available
if [[ $RESULT=="*brew update && brew upgrade*" ]]; then
	echo "Auto-updating platformio..."
	if [[ $(uname -a)=="Darwin" ]]; then
		brew update && brew upgrade
	else
		python -c "$(curl -fsSL https://raw.githubusercontent.com/platformio/platformio/master/scripts/get-platformio.py)"
	fi
fi

echo "Done."
