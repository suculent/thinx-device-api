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
		-w=*|--workdir=*)
				WORKDIR="${i#*=}"
		;;
    *)
      # unknown option
    ;;
esac
done

parse_yaml() {
    local prefix=$2
    local s
    local w
    local fs
    s='[[:space:]]*'
    w='[a-zA-Z0-9_]*'
    fs="$(echo @|tr @ '\034')"
    sed -ne "s|^\($s\)\($w\)$s:$s\"\(.*\)\"$s\$|\1$fs\2$fs\3|p" \
        -e "s|^\($s\)\($w\)$s[:-]$s\(.*\)$s\$|\1$fs\2$fs\3|p" "$1" |
    awk -F"$fs" '{
    indent = length($1)/2;
    vname[indent] = $2;
    for (i in vname) {if (i > indent) {delete vname[i]}}
        if (length($3) > 0) {
            vn=""; for (i=0; i<indent; i++) {vn=(vn)(vname[i])("_")}
            printf("%s%s%s=(\"%s\")\n", "'"$prefix"'",vn, $2, $3);
        }
    }' | sed 's/_=/+=/g'
}

THINX_ROOT=$(pwd)
echo "[builder.sh] Starting builder at path ${THINX_ROOT}"

OWNER_ID_HOME=$THINX_ROOT/data/$OWNER_ID
echo "[builder.sh] Owner workspace: ${OWNER_ID_HOME}"

DEPLOYMENT_PATH=$OWNER_ID_HOME/$UDID/$BUILD_ID
TARGET_PATH=$OWNER_ID_HOME/$UDID
echo "[builder.sh] Deployment path: ${DEPLOYMENT_PATH}"
DISPLAY_DEPLOYMENT_PATH=$(echo ${DEPLOYMENT_PATH} | tr -d "$THINX_WEB_ROOT")
echo "[builder.sh] Display deployment path: ${DISPLAY_DEPLOYMENT_PATH}"

# Create user-referenced folder in public www space
mkdir -p $OWNER_ID_HOME
mkdir -p $DEPLOYMENT_PATH

LOG_PATH="${DEPLOYMENT_PATH}/build.log"
echo "[builder.sh] Log path: $LOG_PATH"
touch $LOG_PATH

if [[ -f "lint.txt" ]]; then
	echo "Found LINT results in current folder:" | tee -a "${LOG_PATH}"
	echo "lint.txt" | tee -a "${LOG_PATH}"
fi

if [[ -f "../lint.txt" ]]; then
	echo "Found LINT results in parent folder:" | tee -a "${LOG_PATH}"
	echo "../lint.txt" | tee -a "${LOG_PATH}"
fi

echo "Logging to ${LOG_PATH}" | tee -a "${LOG_PATH}"
echo "[builder.sh] <b> -=[ ☢ THiNX IoT RTM BUILDER ☢ ]=- </b>" | tee -a "${LOG_PATH}"
echo "[builder.sh] Starting builder at path ${THINX_ROOT}" | tee -a "${LOG_PATH}"
echo "[builder.sh] Owner workspace: ${OWNER_ID_HOME}" | tee -a "${LOG_PATH}"
echo "[builder.sh] Making deployment path: ${DEPLOYMENT_PATH}" | tee -a "${LOG_PATH}"

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

echo "[builder.sh]   url: $url" | tee -a "${LOG_PATH}"
echo "[builder.sh]   proto: $proto" | tee -a "${LOG_PATH}"
echo "[builder.sh]   user: $user" | tee -a "${LOG_PATH}"
echo "[builder.sh]   host: $host" | tee -a "${LOG_PATH}"
echo "[builder.sh]   port: $port" | tee -a "${LOG_PATH}"
echo "[builder.sh]   REPO_PATH: $REPO_PATH" | tee -a "${LOG_PATH}"
echo "[builder.sh]   REPO_NAME: ${REPO_NAME}" | tee -a "${LOG_PATH}"

#echo "[builder.sh] Cleaning workspace..."

# Clean
#rm -rf $THINX_ROOT/tenants/$OWNER_ID/$UDID/$BUILD_ID/$REPO_PATH/**

# TODO: only if $REPO_NAME contains slash(es)
BUILD_PATH=$THINX_ROOT/repositories/$OWNER_ID/$UDID/$BUILD_ID
if [[ ! -d $BUILD_PATH ]]; then
	mkdir -p $BUILD_PATH
fi

echo "[builder.sh] Entering BUILD_PATH $BUILD_PATH" | tee -a "${LOG_PATH}"
cd $BUILD_PATH | tee -a "${LOG_PATH}"
cd $BUILD_PATH && echo $(pwd) | tee -a "${LOG_PATH}"

# Create new working directory
echo "[builder.sh] Creating new REPO_PATH $REPO_PATH" | tee -a "${LOG_PATH}"
mkdir -p $BUILD_PATH/$REPO_PATH

# enter git user folder if any
if [[ -d $GIT_USER ]]; then
	echo "[builder.sh][DEBUG] Entering git user folder inside workspace ./${GIT_USER}..." | tee -a "${LOG_PATH}"
	cd ./$GIT_USER > /dev/null
	pwd | tee -a "${LOG_PATH}"
fi

# Clean workspace
echo "[builder.sh] Cleaning previous git repository / workspace in ${REPO_NAME}..." | tee -a "${LOG_PATH}"
rm -rf $REPO_NAME

# Fetch project
echo "[builder.sh] Cloning ${GIT_REPO}..." | tee -a "${LOG_PATH}"
cd $BUILD_PATH/$GIT_USER && git clone --quiet --recurse-submodules $GIT_REPO

if [[ -d $REPO_NAME ]]; then
	echo "Directory $REPO_NAME exists, entering..." | tee -a "${LOG_PATH}"
	cd ./$REPO_NAME
	pwd | tee -a "${LOG_PATH}"
else
	echo "Directory $REPO_NAME does not exist, entering $REPO_PATH instead..." | tee -a "${LOG_PATH}"
	cd ./$REPO_PATH
	pwd | tee -a "${LOG_PATH}"
fi

pwd | tee -a "${LOG_PATH}"

cd $BUILD_PATH/$REPO_PATH && git submodule update --init --recursive

if [[ ! -d $BUILD_PATH/$REPO_PATH/.git ]]; then
	echo "Not a GIT repository: $(pwd)" | tee -a "${LOG_PATH}"
fi

cd $BUILD_PATH/$REPO_PATH && ls | tee -a "${LOG_PATH}"

COMMIT=$(git rev-parse HEAD)
echo "[builder.sh] Fetched commit ID: ${COMMIT}" | tee -a "${LOG_PATH}"

VERSION=$(git rev-list HEAD --count)
echo "[builder.sh] Repository version/revision: ${VERSION}" | tee -a "${LOG_PATH}"

# Search for thinx.yml

nodemcu_build_type="firmware"
nodemcu_build_float=true

micropython_build_type="firmware"
micropython_platform="esp8266"

if [ -f ./thinx.yml ]; then
	echo "Found thinx.yml file, reading..." | tee -a "${LOG_PATH}"
	parse_yaml ./thinx.yml
	eval $(parse_yaml ./thinx.yml)
fi

# Overwrite Thinx.h file (should be required)

echo "[builder.sh] Searching THiNX-File in $BUILD_PATH/$REPO_PATH..." | tee -a "${LOG_PATH}"

THINX_FILE=$( find $BUILD_PATH/$REPO_PATH -name "thinx.h" -maxdepth 5)

if [[ -z $THINX_FILE ]]; then
	echo "[builder.sh] No THiNX-File found!" | tee -a "${LOG_PATH}"
	# exit 1 # will deprecate on modularization for more platforms
else
	echo "[builder.sh] Found THiNX-File: ${THINX_FILE}" | tee -a "${LOG_PATH}"
fi

THINX_CLOUD_URL="thinx.cloud"
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
BUILD_DATE=$(date +%Y-%m-%d)

# Build

PLATFORM=$(infer_platform $BUILD_PATH/$REPO_PATH)
LANGUAGE=$(language_for_platform $PLATFORM)
LANGUAGE_NAME=$(language_name $LANGUAGE)

echo "[builder.sh] Building for platform '${PLATFORM}' in language '${LANGUAGE_NAME}'..." | tee -a "${LOG_PATH}"

SHA="0x00000000"
OUTFILE="<failed>"
BUILD_SUCCESS=false

# If running inside Docker, we'll start builders as siblings
if [ -f /.dockerenv ]; then
	DOCKER_PREFIX="-v /var/run/docker.sock:/var/run/docker.sock"
else
	DOCKER_PREFIX=""
fi

echo "Changing current directory to WORKDIR $WORKDIR..." | tee -a "${LOG_PATH}"
cd $WORKDIR  | tee -a "${LOG_PATH}"

echo "Current work path: $(pwd)" | tee -a "${LOG_PATH}"
echo "Listing files in work path:" | tee -a "${LOG_PATH}"
ls | tee -a "${LOG_PATH}"

case $PLATFORM in

    micropython)

		  # WARNING! This is a specific builder (like NodeMCU).
			# Injects thinx to esp8266/modules in firmware mode. Should also prebuild SPIFFS.

			BUILD_TYPE=$micropython_build_type
			if [[ $BUILD_TYPE == "firmware" ]]; then
				echo "Build type: firmware" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
			else
				echo "Build type: file" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/boot.py # there is more files here!
			fi

			OUTPATH=${DEPLOYMENT_PATH}

			#echo "Micropython Build: Cleaning SPIFFS folder..." | tee -a "${LOG_PATH}"
			#if [ -f ${DEPLOYMENT_PATH}/local/fs/* ]; then
			#	echo "Cleaning local/fs" | tee -a "${LOG_PATH}"
			#	# rm -rf ${DEPLOYMENT_PATH}/local/fs/** # cleanup first
			#fi

			#CONFIG_PATH="./local/fs/thinx.json"

			#if [ -f $CONFIG_PATH ]; then
			#	echo "Micropython Build: Deconfiguring..." | tee -a "${LOG_PATH}"
			#	rm -rf $CONFIG_PATH
			#fi

			#echo "Micropython Build: Configuring..." | tee -a "${LOG_PATH}"
			#mv "./thinx_build.json" $CONFIG_PATH

			#UPY_FILES=$(find . -name "*.py" -maxdepth 1)
			#echo "Micropython Build: UPY_FILES:" | tee -a "${LOG_PATH}"
			#echo ${UPY_FILES} | tee -a "${LOG_PATH}"

			echo "Micropython Build: Customizing firmware..." | tee -a "${LOG_PATH}"

			for pyfile in ${UPY_FILES[@]}; do
				if [[ $BUILD_TYPE == "firmware" ]]; then
					FSPATH=./$(basename ${pyfile}) # we should already stand in this folder
					if [[ -f $FSPATH ]]; then
						rm -rf $FSPATH
						cp -vf "${pyfile}" $FSPATH
					fi
				else
					cp -vf "${luafile}" "$DEPLOYMENT_PATH"
				fi
			done

			if [[ $BUILD_TYPE == "firmware" ]]; then
				echo "Micropython Build: Running Dockerized builder..." | tee -a "${LOG_PATH}"
				docker run ${DOCKER_PREFIX} --rm -t -v $(pwd)/modules:/micropython/esp8266/modules --workdir /micropython/esp8266 thinx-micropython | tee -a "${LOG_PATH}"
				rm -rf ./build; make clean; make V=1
			fi

			if [[ $? == 0 ]] ; then
				BUILD_SUCCESS=true
			fi

			ls | tee -a "${LOG_PATH}"

			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "NodeMCU Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					ls | tee -a "${LOG_PATH}"
					echo "NodeMCU Build: Listing binary artifacts: " | tee -a "${LOG_PATH}"
					ls ./bin | tee -a "${LOG_PATH}"
					if [[ $BUILD_TYPE == "firmware" ]]; then
						cp -v ./build/*.bin "$OUTPATH" | tee -a "${LOG_PATH}"
						rm -rf ./build/*
					fi
					echo "Micropython Build: DEPLOYMENT_PATH: " $DEPLOYMENT_PATH
					ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					STATUS='"OK"'
				else
					STATUS='"FAILED"'
				fi
			fi
    ;;

		nodemcu)

		  # WARNING! This is a specific builder (like Micropython).
			# Source files must be copied from source folder to the WORKDIR
			# which is actually a source of nodemcu-firmware (esp-open-sdk).

			DROP_INTEGER_USE_FLOAT=$nodemcu_build_float
			if [[ $DROP_INTEGER_USE_FLOAT==true ]]; then
				OUTFILE_PREFIX='nodemcu_integer'
				INTEGER_ONLY=true
				DOCKER_PARAMS="-e INTEGER_ONLY=true"
			else
				OUTFILE_PREFIX='nodemcu_float'
				FLOAT_ONLY=true
				DOCKER_PARAMS="-e FLOAT_ONLY=true"
			fi

			BUILD_TYPE=$nodemcu_build_type
			if [[ $BUILD_TYPE == "firmware" ]]; then
				echo "Build type: firmware" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
			else
				echo "Build type: file" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/thinx.lua # there is more files here!
			fi

			OUTPATH=${DEPLOYMENT_PATH}

			echo "NodeMCU Build: Cleaning SPIFFS folder..." | tee -a "${LOG_PATH}"
			if [ -f ${DEPLOYMENT_PATH}/local/fs/* ]; then
				echo "Cleaning local/fs" | tee -a "${LOG_PATH}"
				# rm -rf ${DEPLOYMENT_PATH}/local/fs/** # cleanup first
			fi

			# Copy firmware sources to current working directory
			cp -vfR $THINX_ROOT/tools/nodemcu-firmware/* .

			CONFIG_PATH="./local/fs/thinx.json"

			if [ -f $CONFIG_PATH ]; then
				echo "NodeMCU Build: Deconfiguring..." | tee -a "${LOG_PATH}"
				rm -rf $CONFIG_PATH
			fi

			echo "NodeMCU Build: Configuring..." | tee -a "${LOG_PATH}"
			mv "./thinx_build.json" $CONFIG_PATH

			FILES=$(find . -name "*.lua" -maxdepth 1)
			echo "NodeMCU Build: FILES:" | tee -a "${LOG_PATH}"
			echo ${FILES} | tee -a "${LOG_PATH}"

			echo "NodeMCU Build: Customizing firmware..." | tee -a "${LOG_PATH}"

			if [[ $BUILD_TYPE == "firmware" ]]; then

				# build into filesystem root
				for luafile in ${FILES[@]}; do
					FSPATH=./local/fs/$(basename ${luafile})
					if [[ -f $FSPATH ]]; then
						rm -rf $FSPATH
						cp -vf "${luafile}" $FSPATH
					fi
					if [ -f ./bin/* ]; then
						echo "NodeMCU Build: Cleaning bin & map files..." | tee -a "${LOG_PATH}"
						rm -rf ./bin/*
					fi
				done

				echo "NodeMCU Build: Running Dockerized builder..." | tee -a "${LOG_PATH}"
				docker run ${DOCKER_PREFIX} --rm -t ${DOCKER_PARAMS} -v `pwd`:/opt/nodemcu-firmware suculent/nodemcu-docker-build | tee -a "${LOG_PATH}"

			else
				# deploy Lua files without building
				cp -vf "${luafile}" "$DEPLOYMENT_PATH"
			fi

			if [[ $? == 0 ]] ; then
				BUILD_SUCCESS=true
			fi

			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "NodeMCU Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					ls | tee -a "${LOG_PATH}"
					echo "NodeMCU Build: Listing binary artifacts: " | tee -a "${LOG_PATH}"
					ls ./bin | tee -a "${LOG_PATH}"
					if [[ $BUILD_TYPE == "firmware" ]]; then
						echo "NodeMCU Build: Copying binary artifacts..." | tee -a "${LOG_PATH}"
						cp -v "./bin/${OUTFILE_PREFIX}*.bin" "${DEPLOYMENT_PATH}/firmware.bin" | tee -a "${LOG_PATH}"
					fi
					echo "NodeMCU Build: DEPLOYMENT_PATH: " $DEPLOYMENT_PATH
					ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					STATUS='"OK"'
				else
					STATUS='"FAILED"'
				fi
			fi
    ;;

    mongoose)
			OUTFILE=${DEPLOYMENT_PATH}/fw.zip
			OUTPATH=${DEPLOYMENT_PATH}

			# should copy thinx.json into ./fs/thinx.json
			TNAME=$(find . -name "thinx.json")
			if [[ -z $TNAME ]]; then
				if [[ ! -d "./fs" ]]; then
					mkdir ./fs
				fi
				TNAME=$(pwd)/fs/thinx.json
			fi
			echo "Moving thinx_build.json to $TNAME" | tee -a "${LOG_PATH}"
			mv "./thinx_build.json" "$TNAME"

			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/mongoose-builder suculent/mongoose-docker-build | tee -a "${LOG_PATH}"

			if [[ $? == 0 ]] ; then
				if [[ -f $(pwd)/build/fw.zip ]]; then
					BUILD_SUCCESS=true
				else
					echo "OUTFILE not created." | tee -a "${LOG_PATH}"
				fi
			fi

			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					STATUS='"OK"'
					cp $(pwd)/build/fw.zip $OUTFILE
					ls "$BUILD_PATH/build" | tee -a "${LOG_PATH}"
					unzip "${BUILD_PATH}/build/fw.zip" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					echo $MSG; echo $MSG | tee -a "${LOG_PATH}"
				else
					STATUS='"FAILED"'
				fi
			fi
    ;;

		arduino)

			for FILE in `ls -l`
				do
				    if test -d $FILE
				    then
				      echo "$FILE is a subdirectory, entering..." | tee -a "${LOG_PATH}"
							# TODO: if $FILE contains *.ino
							INOS=$(ls $FILE/*.ino)
							echo "INOS: ${INOS}" | tee -a "${LOG_PATH}"
							if [[ ! -z "${INOS}" ]]; then
								cd $FILE
								break
							else
								echo "Skipping ${FILE} for there are no INOS inside..." | tee -a "${LOG_PATH}"
							fi
				    fi
				done
			  echo "Building for Arduino from folder:" | tee -a "${LOG_PATH}"
			  pwd | tee -a "${LOG_PATH}"
				ls
				ls | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
				docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/workspace suculent/arduino-docker-build | tee -a "${LOG_PATH}"
				RESULT=$?
				if [[ $RESULT == 0 ]] ; then
					BUILD_SUCCESS=true
					echo " "
					echo "Docker build succeeded."
					echo " "

					echo " " | tee -a "${LOG_PATH}"
					echo "Docker build succeeded." | tee -a "${LOG_PATH}"
					echo " " | tee -a "${LOG_PATH}"
				else
					echo " "
					echo "Docker build with result ${RESULT}"
					echo " "

					echo " " | tee -a "${LOG_PATH}"
					echo "Docker build with result ${RESULT}" | tee -a "${LOG_PATH}"
					echo " " | tee -a "${LOG_PATH}"
				fi
				# Exit on dry run...
				if [[ ! ${RUN} ]]; then
					echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
					STATUS='"DRY_RUN_OK"'
				else
					# Check Artifacts
					if [[ $BUILD_SUCCESS == true ]] ; then
						STATUS='"OK"'
						echo "Exporting artifacts" | tee -a "${LOG_PATH}"

						echo "OUTFILE: $OUTFILE" | tee -a "${LOG_PATH}"
						# Deploy Artifacts
						cd $(ls -d */)
						echo "Current workdir: " | tee -a "${LOG_PATH}"
						pwd
						pwd | tee -a "${LOG_PATH}"
						echo "Current workdir contents: " | tee -a "${LOG_PATH}"
						ls
						ls | tee -a "${LOG_PATH}"
						cp -vf *.bin "$OUTFILE" | tee -a "${LOG_PATH}"
						cp -vf *.elf "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
						echo "Deployment path $DEPLOYMENT_PATH contains:" | tee -a "${LOG_PATH}"
						cp -vR "${OUTFILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"
						ls $DEPLOYMENT_PATH | tee -a "${LOG_PATH}"
					else
						STATUS='"FAILED"'
					fi
				fi
			;;

		platformio)

			if [[ ! -f "./platformio.ini" ]]; then
				PIO=$(find . -name "platformio.ini")
				echo "PIO: $PIO" | tee -a "${LOG_PATH}"
				PIOD=$(echo $PIO | tr -d "platformio.ini")
				echo "PIOD: $PIOD" | tee -a "${LOG_PATH}"
				if [[ -d "${PIOD}" ]]; then
					echo "$PIOD is a subdirectory, entering..." | tee -a "${LOG_PATH}"
					cd $PIOD
				else
					echo "Skipping ${FILE} for there are no PIOS inside..." | tee -a "${LOG_PATH}"
				fi
		  fi

			OUTFILE=$(pwd)/build/firmware.bin
			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/workspace suculent/platformio-docker-build | tee -a "${LOG_PATH}"
			# docker run --rm -ti -v `pwd`:/opt/workspace suculent/platformio-docker-build
			if [[ $? == 0 ]] ; then
				BUILD_SUCCESS=true
			fi
			#echo "Current folder contents after build:" | tee -a "${LOG_PATH}"
			#ls | tee -a "${LOG_PATH}"

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='"DRY_RUN_OK"'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					STATUS='"OK"'
					echo "[builder.sh] ☢ Exporting PlatformIO artifact: ${OUTFILE}"
					cp -vR "${OUTFILE}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					cp -vR "${OUTFILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"
				else
					STATUS='"FAILED"'
				fi
			fi

    ;;

    *)
			MSG="[builder.sh] If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
			echo $MSG; echo $MSG | tee -a "${LOG_PATH}"
      exit 1
    ;;
esac


if [[ ! -f "${OUTFILE}" ]]; then
	OUTFILE="<none>"
	SHA="0x00000000"
else
	SHAX=$(shasum -a 256 $OUTFILE)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
fi

if [[ "${OUTFILE}" == "" ]]; then
	OUTFILE="<none>"
fi

echo "[builder.sh] Build completed with status: $STATUS" | tee -a "${LOG_PATH}"

echo "[builder.sh] Post-flight check:" | tee -a "${LOG_PATH}"

pwd | tee -a "${LOG_PATH}"

echo "DP" $DISPLAY_DEPLOYMENT_PATH | tee -a "${LOG_PATH}"

echo "BUILD_ID" "${BUILD_ID}" | tee -a "${LOG_PATH}"
echo "COMMIT" "${COMMIT}" | tee -a "${LOG_PATH}"
echo "VERSION" "${VERSION}" | tee -a "${LOG_PATH}"
echo "GIT_REPO" "${GIT_REPO}" | tee -a "${LOG_PATH}"
echo "OUTFILE" "${OUTFILE}" | tee -a "${LOG_PATH}"
echo "DEPLOYMENT_PATH" "${DEPLOYMENT_PATH}" | tee -a "${LOG_PATH}"
echo "UDID" "${UDID}" | tee -a "${LOG_PATH}"
echo "SHA" "${SHA}" | tee -a "${LOG_PATH}"
echo "OWNER_ID" "${OWNER_ID}" | tee -a "${LOG_PATH}"
echo "STATUS" "${STATUS}" | tee -a "${LOG_PATH}"

echo "[THiNX] Log path: $LOG_PATH" | tee -a "${LOG_PATH}"

#cat $LOG_PATH

# Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope (or stores into DB later)
CMD="${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${OUTFILE} ${UDID} ${SHA} ${OWNER_ID} ${STATUS}"
echo "Executing Notifier: " $CMD | tee -a "${LOG_PATH}"
cd $ORIGIN # go back to application root folder
RESULT=$(node $THINX_ROOT/notifier.js $CMD)
echo -e "${RESULT}" | tee -a "${LOG_PATH}"

# Upgrade Platformio in case new version is available
if [[ $RESULT == "*platformio upgrade*" ]]; then
		echo "Auto-updating platformio..."
		platformio upgrade > /dev/null
fi

CLEANUP_RESULT=$(bash $THINX_ROOT/couch_cleanup.sh &)
#echo $CLEANUP_RESULT | tee -a "${LOG_PATH}"

MSG="${BUILD_DATE} Done."
echo $MSG | tee -a "${LOG_PATH}"
