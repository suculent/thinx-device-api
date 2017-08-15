#!/bin/bash

source ./infer # utility functions

set +e

echo
echo "[builder.sh] -=[ ☢ THiNX IoT RTM BUILDER ☢ ]=-"
echo "[builder.sh] Running from: $(pwd)"

# FIXME: This is system environment variable and should be configured on installation,
# or injected by build class from Node.js

if [[ -z $THINX_WEB_ROOT ]]; then
		THINX_WEB_ROOT='/var/www/html/bin'
		echo "Setting THINX_WEB_ROOT env var to default ${THINX_WEB_ROOT}"
fi

OWNER_ID='cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12' 		# name of folder where workspaces reside
RUN=true			# dry-run switch
DEVICE='UNKNOWN'	# builds for no device by default, not even ANY
OPEN=false			# show build result in Finder
BUILD_ID='test-build-id'
ORIGIN=$(pwd)
UDID='f8e88e40-43c8-11e7-9ad3-b7281c2b9610'

# ./builder --id=test-build-id --owner=cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12 --udid=a80cc610-4faf-11e7-9a9c-41d4f7ab4083 --git=git@github.com:suculent/thinx-firmware-esp8266.git

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
		-e=*|--env=*)
      ENV_VARS="${i#*=}"
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

LOG_PATH="${DEPLOYMENT_PATH}/build.log"
echo "[builder.sh] Log path: $LOG_PATH"
touch $LOG_PATH
echo "Logging to ${LOG_PATH}"
echo "Logging to ${LOG_PATH}" >> "${LOG_PATH}"
echo "[builder.sh] <b> -=[ ☢ THiNX IoT RTM BUILDER ☢ ]=- </b>" >> "${LOG_PATH}"
echo "[builder.sh] Starting builder at path ${THINX_ROOT}" >> "${LOG_PATH}"
echo "[builder.sh] Owner workspace: ${OWNER_ID_HOME}" >> "${LOG_PATH}"
echo "[builder.sh] Making deployment path: ${DISPLAY_DEPLOYMENT_PATH}" >> "${LOG_PATH}"

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

echo "[builder.sh]   url: $url" >> "${LOG_PATH}"
echo "[builder.sh]   proto: $proto" >> "${LOG_PATH}"
echo "[builder.sh]   user: $user" >> "${LOG_PATH}"
echo "[builder.sh]   host: $host" >> "${LOG_PATH}"
echo "[builder.sh]   port: $port" >> "${LOG_PATH}"
echo "[builder.sh]   REPO_PATH: $REPO_PATH" >> "${LOG_PATH}"
echo "[builder.sh]   REPO_NAME: ${REPO_NAME}" >> "${LOG_PATH}"

#echo "[builder.sh] Cleaning workspace..."

# Clean
#rm -rf $THINX_ROOT/tenants/$OWNER_ID/$UDID/$BUILD_ID/$REPO_PATH/**

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

echo "[builder.sh] Cloning ${GIT_REPO}..." >> "${LOG_PATH}"
# Fetch project
git clone $GIT_REPO

if [[ -d $REPO_NAME ]]; then
	pushd ./$REPO_NAME
else
	pushd ./$REPO_PATH
fi

git submodule update --init --recursive

if [[ ! -d .git ]]; then
	echo "Not a GIT repository: $(pwd)" >> "${LOG_PATH}"
	ls
fi

COMMIT=$(git rev-parse HEAD)
echo "[builder.sh] Fetched commit ID: ${COMMIT}" >> "${LOG_PATH}"

VERSION=$(git rev-list HEAD --count)
echo "[builder.sh] Repository version/revision: ${VERSION}" >> "${LOG_PATH}"

# Overwrite Thinx.h file (should be required)

echo "Seaching THiNX-File in ${OWNER_PATH}..." >> "${LOG_PATH}"

echo $(pwd)

#THINX_FILE=$( find ${OWNER_PATH} | grep "/thinx.h" )
#
#if [[ -z $THINX_FILE ]]; then
#	echo "No THiNX-File found!" >> "${LOG_PATH}"
#	exit 1 # will deprecate on modularization for more platforms
#else
#	echo "Found THiNX-File: ${THINX_FILE}" >> "${LOG_PATH}"
#fi

THINX_CLOUD_URL="rtm.thinx.cloud"
THINX_MQTT_URL="${THINX_CLOUD_URL}"

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

# Build

echo "Inferring platform from ${OWNER_PATH}"
PLATFORM=$(infer_platform ".")
echo "Platform: ${PLATFORM}"

echo "Inferring language from platform ${PLATFORM}"
LANGUAGE=$(language_for_platform $PLATFORM)
echo "Language: ${LANGUAGE}"

echo "Inferring language name from language ${LANGUAGE}"
LANGUAGE_NAME=$(language_name $LANGUAGE)
echo "Language name: ${LANGUAGE_NAME}"

echo "[builder.sh] Building for platform ${PLATFORM} in language ${LANGUAGE_NAME}..."

SHA="0x00000000"
OUTFILE="build.failed"
BUILD_SUCCESS=false

# If running inside Docker, we'll start builders as siblings
if [ -f /.dockerenv ]; then
	DOCKER_PREFIX="-v /var/run/docker.sock:/var/run/docker.sock"
else
	DOCKER_PREFIX=""
fi

case $PLATFORM in

    micropython)
		  OUTFILE=${DEPLOYMENT_PATH}/boot.py
			OUTPATH=${DEPLOYMENT_PATH}/
			#docker pull suculent/micropython-docker-build
			#cd ./tools/micropython-docker-build
			#cd modules
			# TODO: FIXME: Inject data from user repository to filesystem here...
			git clone https://github.com/suculent/thinx-firmware-esp8266-upy.git
			mv ./thinx-firmware-esp8266-upy/boot.py ./boot.py
			rm -rf thinx-firmware-esp8266-upy
			docker run ${DOCKER_PREFIX} --rm -t -v $(pwd)/modules:/micropython/esp8266/modules --workdir /micropython/esp8266 thinx-micropython >> "${LOG_PATH}"
			rm -rf ./build; make clean; make V=1

			if [[ $?==0 ]] ; then
				BUILD_SUCCESS=true
			fi

			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." >> "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS==true ]] ; then
					STATUS='"OK"'
					cp -v ./build/*.bin "$OUTPATH" >> "${LOG_PATH}"
					cp -vR ./build/**/*.py "$OUTPATH" >> "${LOG_PATH}"
					rm -rf ./build/*
					ls "$OUTPATH" >> "${LOG_PATH}"
					OUTFILE="${OUTPATH}/*.bin"
				else
					STATUS='"BUILD FAILED."'
				fi
				# TODO: deploy
			fi
    ;;

		nodemcu)
			OUTFILE=${DEPLOYMENT_PATH}/thinx.lua # there is more!
			OUTPATH=${DEPLOYMENT_PATH}/
			# possibly lua-modules extended with thinx
			mv "./thinx_build.json" "$THINX_ROOT/tools/nodemcu-firmware/local/fs/thinx.json"
			cp -v "${OWNER_PATH}/*.lua" "$DEPLOYMENT_PATH" >> "${LOG_PATH}"
			rm -rf $THINX_ROOT/tools/nodemcu-firmware/local/fs/** # cleanup first
			cp -v "${OWNER_PATH}/*.lua" "$THINX_ROOT/tools/nodemcu-firmware/local/fs" >> "${LOG_PATH}"

			# Options:
			# You can pass the following optional parameters to the Docker build like so docker run -e "<parameter>=value" -e ....
			# IMAGE_NAME The default firmware file names are nodemcu_float|integer_<branch>_<timestamp>.bin. If you define an image name it replaces the <branch>_<timestamp> suffix and the full image names become nodemcu_float|integer_<image_name>.bin.
			# INTEGER_ONLY Set this to 1 if you don't need NodeMCU with floating support, cuts the build time in half.
			# FLOAT_ONLY Set this to 1 if you only need NodeMCU with floating support, cuts the build time in half.

			# TODO: May be skipped with file-only update

			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/nodemcu-firmware suculent/nodemcu-docker-build >> "${LOG_PATH}"

			if [[ $?==0 ]] ; then
				BUILD_SUCCESS=true
			fi

			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." >> "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS==true ]] ; then
					cp -v ./bin/*.bin "$OUTPATH" >> "${LOG_PATH}"
					rm -rf ./bin/*
					STATUS='"OK"'
					ls "$OWNER_PATH" >> "${LOG_PATH}"
					OUTFILE="${OWNER_PATH}/firmware.bin"
				else
					STATUS='"BUILD FAILED."'
				fi
				# TODO: deploy
			fi
    ;;

    mongoose)
			OUTFILE=${DEPLOYMENT_PATH}/mos_build.zip # FIXME: warning! multiple files here
			OUTPATH=${DEPLOYMENT_PATH}/

			# should copy thinx.json into ./fs/thinx.json
			TNAME=$(find . -name "thinx.json")
			echo "Moving thinx_build.json to $TNAME"
			mv "./thinx_build.json" "$TNAME"

			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/mongoose-builder suculent/mongoose-docker-build >> "${LOG_PATH}"

			if [[ $?==0 ]] ; then
				BUILD_SUCCESS=true
			fi

			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." >> "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS==true ]] ; then
					STATUS='"OK"'
					ls "$OWNER_PATH/build" >> "${LOG_PATH}"
					unzip "${OWNER_PATH}/build/fw.zip" "$DEPLOYMENT_PATH" >> "${LOG_PATH}"
					ls "$DEPLOYMENT_PATH" >> "${LOG_PATH}"
					echo $MSG; echo $MSG >> "${LOG_PATH}"
				else
					STATUS='"BUILD FAILED."'
				fi
				# TODO: deploy
			fi
    ;;

		arduino)
			OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/arduino-builder suculent/arduino-docker-build >> "${LOG_PATH}"
			if [[ $?==0 ]] ; then
				BUILD_SUCCESS=true
			fi
			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." >> "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS==true ]] ; then
					STATUS='"OK"'
					echo "TODO: Deploy artifacts."
					cd *
					OUTFILE=$(./*.with_bootloader.hex)
					echo "OUTFILE: $OUTFILE"
					pwd
					ls
					ls "$OWNER_PATH" >> "${LOG_PATH}"
					cp -vR "${OWNER_PATH}/firmware.bin" "$DEPLOYMENT_PATH" >> "${LOG_PATH}"
				else
					STATUS='"BUILD FAILED."'
				fi
				# TODO: deploy
			fi

		;;

		platformio)
			OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/platformio-builder suculent/platformio-docker-build >> "${LOG_PATH}"
			if [[ $?==0 ]] ; then
				BUILD_SUCCESS=true
			fi
			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." >> "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS==true ]] ; then
					STATUS='"OK"'
					ls "${OWNER_PATH}/.pioenvs/" >> "${LOG_PATH}"
					# TODO: d1_mini is a board name that is not parametrized but must be eventually
					OUTFILE="${OWNER_PATH}/.pioenvs/d1_mini/firmware.bin"
					cp -vR "${OUTFILE}" "$DEPLOYMENT_PATH" >> "${LOG_PATH}"
				else
					STATUS='"BUILD FAILED."'
				fi
				# TODO: deploy
			fi

    ;;

    *)
			MSG="[builder.sh] If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
			echo $MSG; echo $MSG >> "${LOG_PATH}"
      exit 1
    ;;
esac

if [ $STATUS != "BUILD FAILED." ]; then
	SHAX=$(shasum -a 256 $OUTFILE)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
else
	SHA="0x00000000"
fi

if [[ ! -f "${OUTFILE}" ]]; then
	OUTFILE="<none>"
fi

if [[ "${OUTFILE}" == "" ]]; then
	OUTFILE="<none>"

echo "[builder.sh] Build completed with status: $STATUS" >> "${LOG_PATH}"

popd
popd

echo "[builder.sh] Post-flight check:" >> "${LOG_PATH}"

echo "DP" $DISPLAY_DEPLOYMENT_PATH >> "${LOG_PATH}"

echo "BUILD_ID" "${BUILD_ID}" >> "${LOG_PATH}"
echo "COMMIT" "${COMMIT}" >> "${LOG_PATH}"
echo "VERSION" "${VERSION}" >> "${LOG_PATH}"
echo "GIT_REPO" "${GIT_REPO}" >> "${LOG_PATH}"
echo "OUTFILE" "${OUTFILE}" >> "${LOG_PATH}"
echo "DEPLOYMENT_PATH" "${DEPLOYMENT_PATH}" >> "${LOG_PATH}"
echo "UDID" "${UDID}" >> "${LOG_PATH}"
echo "SHA" "${SHA}" >> "${LOG_PATH}"
echo "OWNER_ID" "${OWNER_ID}" >> "${LOG_PATH}"
echo "STATUS" "${STATUS}" >> "${LOG_PATH}"

echo "[THiNX] Log path: $LOG_PATH" >> "${LOG_PATH}"

#cat $LOG_PATH

# Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope (or stores into DB later)
CMD="${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${OUTFILE} ${UDID} ${SHA} ${OWNER_ID} ${STATUS}"
echo "Executing Notifier: " $CMD >> "${LOG_PATH}"
pushd $ORIGIN # go back to application root folder
RESULT=$(node $THINX_ROOT/notifier.js $CMD)
echo -e "${RESULT}"
echo -e "${RESULT}" >> "${LOG_PATH}"

# Upgrade Platformio in case new version is available
if [[ $RESULT=="*platformio upgrade*" ]]; then
		echo "Auto-updating platformio..."
		platformio upgrade
fi

CLEANUP_RESULT=$(bash $THINX_ROOT/couch_cleanup.sh)
echo $CLEANUP_RESULT; echo $CLEANUP_RESULT >> "${LOG_PATH}"

MSG="${BUILD_DATE} Done."
echo $MSG; echo $MSG >> "${LOG_PATH}"

# copy whole log output to console for easier debugging
cat "${LOG_PATH}"
