#!/bin/bash

source ./infer # utility functions like parse_yaml

# do not exit when subsequent tools fail...
set +e

echo
echo "[builder.sh] -=[ ☢  THiNX IoT RTM BUILDER ☢ ]=-"
echo "[builder.sh] Running from: $(pwd)"

# FIXME: This is system environment variable and should be configured on installation,
# or injected by build class from Node.js

if [[ -z $THINX_WEB_ROOT ]]; then
		THINX_WEB_ROOT="\/var\/www\/html\/bin"
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

THINX_ROOT=$(pwd)
echo "[builder.sh] Starting builder at path ${THINX_ROOT}"

# from app_config.data_root

DATA_ROOT="/mnt/data"

# from app_config.build_root
BUILD_ROOT=$DATA_ROOT/repos

# from app_config.deploy_root
OWNER_ID_HOME=$DATA_ROOT/deploy/$OWNER_ID
echo "[builder.sh] Owner deployment home: ${OWNER_ID_HOME}"

TARGET_PATH=$DATA_ROOT/deploy/$OWNER_ID/$UDID
echo "[builder.sh] Target device deployment path: ${TARGET_PATH}"

DEPLOYMENT_PATH=$OWNER_ID_HOME/$UDID/$BUILD_ID
echo "[builder.sh] Deployment path: ${DEPLOYMENT_PATH}"

# seems deprecated or a mess, rather remove...
#DISPLAY_DEPLOYMENT_PATH=$(sed 's/${THINX_WEB_ROOT}//g' <<< $DEPLOYMENT_PATH)
#echo "[builder.sh] Display deployment path: ${DISPLAY_DEPLOYMENT_PATH}"

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

echo "[builder.sh] Logging to ${LOG_PATH}" | tee -a "${LOG_PATH}"
echo "[builder.sh] Starting builder at path ${THINX_ROOT}" | tee -a "${LOG_PATH}"
echo "[builder.sh] Owner workspace: ${OWNER_ID_HOME}" | tee -a "${LOG_PATH}"
echo "[builder.sh] Making deployment path: ${DEPLOYMENT_PATH}" | tee -a "${LOG_PATH}"

# TODO: Fix this, depends on protocol (changes with git+ssh)
# extract the protocol
proto="$(echo $GIT_REPO | grep :// | sed -e's,^\(.*://\).*,\1,g')"
if [[ -z $proto ]]; then
  proto="git-ssl"
fi
echo "proto: $proto"

## Following works for the HTTPS protocol, not GIT+SSL
# remove the protocol
url="$(echo ${GIT_REPO/$proto/})"
echo "url: $url"

user="$(echo $url | grep @ | cut -d@ -f1)"
echo "user: $user"

host="$(echo ${url/$user@/} | cut -d/ -f1)"
echo "host: $host"

# by request - try to extract the port; support custom git ports in future
port="$(echo $host | sed -e 's,^.*:,:,g' -e 's,.*:\([0-9]*\).*,\1,g' -e 's,[^0-9],,g')"
if [[ -z $port ]]; then
  port=22
fi
echo "port: $port"

REPO_PATH="$(echo $url | grep / | cut -d/ -f2-)"
echo "REPO_PATH: $REPO_PATH"

# will be overridden in git mode
REPO_NAME="$(echo $url | grep / | cut -d/ -f3-)"
if [[ ! -z $REPO_NAME ]]; then
  echo "REPO_NAME A: $REPO_NAME"
fi

echo

if [[ "$user" == "git" ]]; then
  echo "Overriding for user git and git-ssl..."
	proto="git-ssl"
	len=${#REPO_NAME}
	OLDHOST=$host

  echo "host-x:        $host"

	GIT_PATH=$REPO_PATH
	REPO_PATH="$(sed 's/.git//g' <<< $GIT_PATH)"
	REPO_NAME="$(echo $url | grep / | cut -d/ -f2-)"
  echo "REPO_NAME C:   $REPO_NAME"
	user="$(echo $OLDHOST | grep : | cut -d: -f2-)"
	#host="$(echo $OLDHOST | grep @ | cut -d: -f1)"
  host="$(echo $OLDHOST | grep : | cut -d: -f1)"
	# host="$(echo $url | grep @ | cut -d: -f2-)" # - returns suculent/keyguru-firmware-zion.git
else
	echo "In git-https mode, user is also from url..."
  user=$(echo $url | grep / | cut -d/ -f2-)
  echo $user
  user=$(echo $user | grep / | cut -d/ -f1)
  echo $user
fi

echo

echo "------- RESULTS -----"

echo "GIT_REPO:    $GIT_REPO"
echo "proto:       $proto"
echo "url:         $url"
echo "user:        $user"
echo "host:        $host"
echo "port:        $port"
echo "REPO_PATH:   $REPO_PATH"
echo "REPO_NAME:   $REPO_NAME"

# make sure to remove trailing git for HTTP URLs as well...
# REPO_PATH=$BUILD_PATH/${REPO_PATH%.git}
REPO_PATH=${REPO_PATH%.git}
REPO_NAME=${REPO_NAME%.git}

echo "[builder.sh] - url: $url" 								| tee -a "${LOG_PATH}"
echo "[builder.sh] - proto: $proto" 						| tee -a "${LOG_PATH}"
echo "[builder.sh] - user: $user" 							| tee -a "${LOG_PATH}"
echo "[builder.sh] - host: $host" 							| tee -a "${LOG_PATH}"
echo "[builder.sh] - REPO_PATH: $REPO_PATH" 		| tee -a "${LOG_PATH}"
echo "[builder.sh] - REPO_NAME: ${REPO_NAME}" 	| tee -a "${LOG_PATH}"

#echo "[builder.sh] Cleaning workspace..."

# Clean
#rm -rf $THINX_ROOT/tenants/$OWNER_ID/$UDID/$BUILD_ID/$REPO_PATH/**

# TODO: only if $REPO_NAME contains slash(es)
BUILD_PATH=$BUILD_ROOT/$OWNER_ID/$UDID/$BUILD_ID
if [[ ! -d $BUILD_PATH ]]; then
	mkdir -p $BUILD_PATH
fi

echo "[builder.sh] Entering BUILD_PATH $BUILD_PATH" | tee -a "${LOG_PATH}"
cd $BUILD_PATH && pwd | tee -a "${LOG_PATH}"

# Clean workspace is now deprecated as builder runs in pre-fetched repo
# echo "[builder.sh] Cleaning previous git repository / workspace in ${REPO_NAME}..." | tee -a "${LOG_PATH}"
# rm -rf $REPO_NAME

# Fetch project
echo "Current working directory: "
pwd | tee -a "${LOG_PATH}"
echo "Project initial directory files: "
ls | tee -a "${LOG_PATH}"
cd .* # enter any path, there should be nothing else here
echo "Project root directory: "
pwd | tee -a "${LOG_PATH}"
echo "Project root directory files (pre-fetch): "
ls | tee -a "${LOG_PATH}"
echo "[builder.sh] Pulling ${GIT_REPO}..." | tee -a "${LOG_PATH}"
git pull | tee -a "${LOG_PATH}"
echo "Project root directory files (post-fetch): "
ls | tee -a "${LOG_PATH}"

# Fetch submodules if any
SINK=""
if [[ -d $REPO_NAME ]]; then
	echo "[builder.sh] Directory $REPO_NAME exists, entering..." | tee -a "${LOG_PATH}"
	cd ./$REPO_NAME
	SINK=$BUILD_PATH/$REPO_NAME
	echo "[builder.sh] SRC_PATH CHECK:" | tee -a "${LOG_PATH}"
else
	pwd && ls
	pwd | tee -a "${LOG_PATH}"
	ls | tee -a "${LOG_PATH}"
	echo "[builder.sh] REPO_NAME ${REPO_NAME} does not exist, entering $REPO_PATH instead..." | tee -a "${LOG_PATH}"
	SINK=$BUILD_PATH/$REPO_PATH
	cd $SINK
	echo "[builder.sh] SRC_PATH CHECK:" | tee -a "${LOG_PATH}"
fi

pwd | tee -a "${LOG_PATH}"
ls | tee -a "${LOG_PATH}"

git submodule update --init --recursive

if [[ ! -d $SINK/.git ]]; then
	echo "[builder.sh] WARNING! No .git folder in repository: $BUILD_PATH/$REPO_PATH/.git" | tee -a "${LOG_PATH}"
	pwd | tee -a "${LOG_PATH}"
	ls | tee -a "${LOG_PATH}"
	exit 1
fi

COMMIT=$(cd $SINK && git rev-parse HEAD)
echo "[builder.sh] Fetched commit ID: ${COMMIT}" | tee -a "${LOG_PATH}"

VERSION=$(cd $SINK && git rev-list HEAD --count)
echo "[builder.sh] Repository version/revision: ${VERSION}" | tee -a "${LOG_PATH}"

# Search for thinx.yml

nodemcu_build_type="firmware"
nodemcu_build_float=true

micropython_build_type="firmware"
micropython_platform="esp8266"

YML=$(find $BUILD_PATH/$REPO_PATH -name "thinx.yml" -maxdepth 2)
if [[ -f $YML ]]; then
	echo "[builder.sh] Found ${YML}, reading..." | tee -a "${LOG_PATH}"
	parse_yaml $YML
	eval $(parse_yaml $YML)
else
		exit 1
fi

# Overwrite Thinx.h file (should be required)

echo "[builder.sh] Searching THiNX-File in $BUILD_PATH/$REPO_PATH..." | tee -a "${LOG_PATH}"

THINX_CLOUD_URL="thinx.cloud"
THINX_MQTT_URL="${THINX_CLOUD_URL}"

if [[ ! -z $DEVICE_ALIAS ]]; then
	THINX_ALIAS=$DEVICE_ALIAS
else
	THINX_ALIAS="vanilla"
fi

THX_VERSION="$(cd $BUILD_PATH/$REPO_PATH && git describe --abbrev=0 --tags)"
if [[ $? > 0 ]]; then
	THX_VERSION="1.0"
fi

THX_REVISION="$(cd $BUILD_PATH/$REPO_PATH && git rev-list HEAD --count)"
if [[ $? > 0 ]]; then
	THX_REVISION="1"
fi

REPO_NAME="$(basename $BUILD_PATH/$REPO_PATH )"
REPO_VERSION="${THX_VERSION}.${VERSION}" # todo: is not semantic at all
BUILD_DATE=$(date +%Y-%m-%d)

# Build

PLATFORM=$(infer_platform $SINK)
LANGUAGE=$(language_for_platform $PLATFORM)
LANGUAGE_NAME=$(language_name $LANGUAGE)

ls | tee -a "${LOG_PATH}"

if [[ -z $PLATFORM ]]; then
	echo "No language. Cannot continue builder."
	exit 1
fi

if [[ -z $LANGUAGE ]]; then
	echo "No language. Cannot continue builder."
	exit 1
fi


echo "[builder.sh] Building for platform '${PLATFORM}' in language '${LANGUAGE_NAME}'..." | tee -a "${LOG_PATH}"

SHA="0x00000000"
OUTFILE="<none>"
BUILD_SUCCESS=false

# If running inside Docker, we'll start builders as siblings
if [ -f /.dockerenv ]; then
	DOCKER_PREFIX="-v /var/run/docker.sock:/var/run/docker.sock"
else
	DOCKER_PREFIX=""
fi

echo "[builder.sh] Changing current directory to WORKDIR $WORKDIR..." | tee -a "${LOG_PATH}"
cd $WORKDIR  | tee -a "${LOG_PATH}"

echo "[builder.sh] Current PWD: $(pwd)" | tee -a "${LOG_PATH}"

case $PLATFORM in

		nodejs)

			# WARNING! This is a specific builder.
			# Should only copy. Basic NodeJS client supports git and should fetch repo on its own.

			OUTFILE=${DEPLOYMENT_PATH}/build
			touch $OUTFILE
			#	zip -rv "${BUILD_ID}.zip" | tee -a "${LOG_PATH}" ./* # zip artefacts
			BUILD_SUCCESS=true
			echo "[builder.sh] There's nothing to build on NodeJS projects." | tee -a "${LOG_PATH}"
			OUTPATH=${DEPLOYMENT_PATH}

			ls | tee -a "${LOG_PATH}"

			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "[builder.sh] NodeJS Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					ls | tee -a "${LOG_PATH}"
					STATUS='OK'
				else
					STATUS='FAILED'
				fi
			fi
		;;

    micropython)

		  # WARNING! This is a specific builder (like NodeMCU).
			# Injects thinx to esp8266/modules in firmware mode. Should also prebuild SPIFFS.

			BUILD_TYPE=$micropython_build_type
			if [[ $BUILD_TYPE == "file" ]]; then
				echo "Build type: file" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/boot.py
				cp -vf $WORKDIR/*.py ${DEPLOYMENT_PATH} # copy all .py files without building
				zip -rv "${BUILD_ID}.zip" | tee -a "${LOG_PATH}" ./* # zip artefacts
			else
				echo "[builder.sh] Build type: firmware (or undefined)" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
				if [[ $(find $OUTFILE -type f -size +10000c 2>/dev/null) ]]; then
					rm -rf $OUTFILE
					BUILD_SUCCESS=false
					echo "[builder.sh] Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
				fi
			fi

			OUTPATH=${DEPLOYMENT_PATH}

			echo "[builder.sh] Micropython Build: Customizing firmware..." | tee -a "${LOG_PATH}"

			UPY_FILES=$(find $WORKDIR -name *.py)

			for pyfile in ${UPY_FILES[@]}; do
				if [[ $BUILD_TYPE == "firmware" ]]; then
					FSPATH=$WORKDIR/$(basename ${pyfile}) # we should already stand in this folder
					if [[ -f $FSPATH ]]; then
						rm -rf $FSPATH
						cp -vf "${pyfile}" $FSPATH
						zip -rv "${BUILD_ID}.zip" ${pyfile} ./* # zip artefacts
					fi
				else
					cp -vf "${pyfile}" "$DEPLOYMENT_PATH"
					zip -rv "${BUILD_ID}.zip" ${pyfile} ./* # zip artefacts
				fi
			done

			if [[ $BUILD_TYPE == "firmware" ]]; then
				echo "[builder.sh] Micropython Build: Running Dockerized builder..." | tee -a "${LOG_PATH}"
				echo "[builder.sh] running Docker >>>"
				set -o pipefail
				docker run ${DOCKER_PREFIX} --rm -t -v $(pwd)/modules:/micropython/esp8266/modules --workdir /micropython/esp8266 thinx-micropython | tee -a "${LOG_PATH}"
				echo "${PIPESTATUS[@]}"
				if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
					BUILD_SUCCESS=true
					zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ./* # zip artefacts
				fi
				if [[ $(find $OUTFILE -type f -size +10000c 2>/dev/null) ]]; then
					rm -rf $OUTFILE
					BUILD_SUCCESS=false
					echo "[builder.sh] Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
				fi
				echo "[builder.sh] Docker completed <<<"
				rm -rf ./build; make clean; make V=1
			fi

			ls | tee -a "${LOG_PATH}"

			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "[builder.sh] NodeMCU Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					ls | tee -a "${LOG_PATH}"
					echo "[builder.sh] NodeMCU Build: Listing binary artifacts: " | tee -a "${LOG_PATH}"
					ls ./bin | tee -a "${LOG_PATH}"
					if [[ $BUILD_TYPE == "firmware" ]]; then
						cp -v ./build/*.bin "$OUTPATH" | tee -a "${LOG_PATH}"
						zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
						rm -rf ./build/*
					fi
					echo "[builder.sh] Micropython Build: DEPLOYMENT_PATH: " $DEPLOYMENT_PATH
					ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					STATUS='OK'
				else
					STATUS='FAILED'
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
			if [[ $BUILD_TYPE == "file" ]]; then
				echo "[builder.sh] Build type: file" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/thinx.lua
				zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ${OUTFILE} # zip artefacts
			else
				echo "[builder.sh] Build type: firmware (or undefined)" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
				zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ${OUTFILE} # zip artefacts
				if [[ $(find $OUTFILE -type f -size +10000c 2>/dev/null) ]]; then
					rm -rf $OUTFILE
					BUILD_SUCCESS=false
					echo "[builder.sh] Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
				fi
			fi

			OUTPATH=${DEPLOYMENT_PATH}

			echo "[builder.sh] NodeMCU Build: Cleaning SPIFFS folder..." | tee -a "${LOG_PATH}"
			if [ -f ${DEPLOYMENT_PATH}/local/fs/* ]; then
				echo "Cleaning local/fs" | tee -a "${LOG_PATH}"
				# rm -rf ${DEPLOYMENT_PATH}/local/fs/** # cleanup first
			fi

			# Copy firmware sources to current working directory
			cp -vfR $THINX_ROOT/tools/nodemcu-firmware/* .

			CONFIG_PATH="./local/fs/thinx.json"

			if [ -f $CONFIG_PATH ]; then
				echo "[builder.sh] NodeMCU Build: Deconfiguring..." | tee -a "${LOG_PATH}"
				rm -rf $CONFIG_PATH
			fi

			echo "[builder.sh] NodeMCU Build: Configuring..." | tee -a "${LOG_PATH}"
			mv "./thinx_build.json" $CONFIG_PATH

			FILES=$(find . -maxdepth 1 -name "*.lua")
			echo "[builder.sh] NodeMCU Build: FILES:" | tee -a "${LOG_PATH}"
			echo ${FILES} | tee -a "${LOG_PATH}"

			echo "[builder.sh] NodeMCU Build: Customizing firmware..." | tee -a "${LOG_PATH}"

			if [[ $BUILD_TYPE == "firmware" ]]; then

				# build into filesystem root
				for luafile in ${FILES[@]}; do
					FSPATH=./local/fs/$(basename ${luafile})
					if [[ -f $FSPATH ]]; then
						rm -rf $FSPATH
						cp -vf "${luafile}" $FSPATH
					fi
					if [ -f ./bin/* ]; then
						echo "[builder.sh] NodeMCU Build: Cleaning bin & map files..." | tee -a "${LOG_PATH}"
						rm -rf ./bin/*
					fi
				done

				echo "[builder.sh] NodeMCU Build: Running Dockerized builder..." | tee -a "${LOG_PATH}"
				echo "[builder.sh] running Docker >>>"
				set -o pipefail
				docker run ${DOCKER_PREFIX} --rm -t ${DOCKER_PARAMS} -v `pwd`:/opt/nodemcu-firmware suculent/nodemcu-docker-build | tee -a "${LOG_PATH}"
				echo "${PIPESTATUS[@]}"
				if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
					BUILD_SUCCESS=true
					zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ./bin/* # zip artefacts
				fi
				echo "[builder.sh] Docker completed <<<"

			else
				# deploy Lua files without building
				cp -vf *.lua "$DEPLOYMENT_PATH"
				zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ${FILES} # zip artefacts
			fi

			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "[builder.sh] NodeMCU Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					ls | tee -a "${LOG_PATH}"
					echo "[builder.sh] NodeMCU Build: Listing binary artifacts: " | tee -a "${LOG_PATH}"
					ls ./bin | tee -a "${LOG_PATH}"
					if [[ $BUILD_TYPE == "firmware" ]]; then
						echo "[builder.sh] NodeMCU Build: Copying binary artifacts..." | tee -a "${LOG_PATH}"
						cp -v "./bin/${OUTFILE_PREFIX}*.bin" "${DEPLOYMENT_PATH}/firmware.bin" | tee -a "${LOG_PATH}"
					fi
					echo "[builder.sh] NodeMCU Build: DEPLOYMENT_PATH: " $DEPLOYMENT_PATH
					ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ./bin/* # zip artefacts
					STATUS='OK'
				else
					STATUS='FAILED'
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
			echo "[builder.sh] Moving thinx_build.json to $TNAME" | tee -a "${LOG_PATH}"
			mv "./thinx_build.json" "$TNAME"

			echo "[builder.sh] running Docker >>>"
			set -o pipefail
			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/mongoose-builder suculent/mongoose-docker-build | tee -a "${LOG_PATH}"
			echo "${PIPESTATUS[@]}"
			if [[ ! -z =$(echo ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
				if [[ -f $(pwd)/build/fw.zip ]]; then
					BUILD_SUCCESS=true
					zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
				else
					echo "[builder.sh] OUTFILE not created." | tee -a "${LOG_PATH}"
				fi
			fi
			echo "[builder.sh] Docker completed <<<"

			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					STATUS='OK'
					cp $(pwd)/build/fw.zip $OUTFILE
					ls "$BUILD_PATH/build" | tee -a "${LOG_PATH}"
					unzip "${BUILD_PATH}/build/fw.zip" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					echo "[builder.sh]" $MSG; echo $MSG | tee -a "${LOG_PATH}"
					zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
				else
					STATUS='FAILED'
				fi
			fi
    ;;

		arduino)

			THINX_FILE=$( find $BUILD_PATH/$REPO_PATH -name "thinx.h" )

			if [[ -z $THINX_FILE ]]; then
				echo "[builder.sh] WARNING! No THiNX-File found! in $BUILD_PATH/$REPO_PATH: $THINX_FILE" | tee -a "${LOG_PATH}"
				# exit 1 # will deprecate on modularization for more platforms
			else
				echo "[builder.sh] Found THiNX-File: ${THINX_FILE}" | tee -a "${LOG_PATH}"
			fi

			for FILE in ./*
				do
						if "$FILE" !== "lib"
						then
					    if test -d $FILE
					    then
					      echo "[builder.sh] $FILE is a subdirectory, entering..." | tee -a "${LOG_PATH}"
								INOS=$(find $FILE -maxdepth 1 -name "*.ino")
								if [[ ! -z "${INOS}" ]]; then
									echo "[builder.sh] Selecting Arduino project: ${INOS}" | tee -a "${LOG_PATH}"
									cd $FILE
									break
								else
									echo "[builder.sh] Skipping ${FILE} for there are no INOS inside..." | tee -a "${LOG_PATH}"
								fi
					    fi
						fi
				done
			  echo "[builder.sh] Building for Arduino from folder:" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin

				echo "Deployment path: " | tee -a "${LOG_PATH}"
				ls ${DEPLOYMENT_PATH} | tee -a "${LOG_PATH}"

				echo "[builder.sh] running Docker >>>" | tee -a "${LOG_PATH}"
				set -o pipefail
				docker run ${DOCKER_PREFIX} -t -v `pwd`:/opt/workspace suculent/arduino-docker-build | tee -a "${LOG_PATH}"
				echo "PIPESTATUS ${PIPESTATUS[@]}" | tee -a "${LOG_PATH}"

				cd build

				pwd | tee -a "${LOG_PATH}"
				ls | tee -a "${LOG_PATH}"
				ls "sketch" | tee -a "${LOG_PATH}"

				echo "[builder.sh] Docker completed <<<" | tee -a "${LOG_PATH}"



				# TODO: Check for firmware.bin! Result is of tee (probably)

				if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
					BUILD_SUCCESS=true

					# should be on $BUILD_PATH
					INFILE=$( find . -name "firmware.bin" )

					if [[ ! -f $INFILE ]]; then
						echo "INFILE $INFILE not found!"
						BUILD_SUCCESS=false
						exit 1
					fi

					if [[ $(find $INFILE -type f -size +10000c 2>/dev/null) ]]; then
						rm -rf $INFILE
						BUILD_SUCCESS=false
						echo "[builder.sh] Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
					else
						echo " " | tee -a "${LOG_PATH}"
						echo "[builder.sh] Docker build succeeded." | tee -a "${LOG_PATH}"
						echo " " | tee -a "${LOG_PATH}"
						BIN_FILE=$( find $BUILD_PATH -name "firmware.bin" )
						echo "BIN_FILE: $BIN_FILE" | tee -a "${LOG_PATH}"
						zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ${BIN_FILE} # zip artefacts
					fi
				else
					echo " " | tee -a "${LOG_PATH}"
					echo "[builder.sh] Docker build with result ${RESULT}" | tee -a "${LOG_PATH}"
					BIN_FILE=$( find $BUILD_PATH -name "firmware.bin" )
					echo "BIN_FILE: $BIN_FILE" | tee -a "${LOG_PATH}"
					echo " " | tee -a "${LOG_PATH}"
				fi

				# Exit on dry run...
				if [[ ! ${RUN} ]]; then
					echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
					STATUS='DRY_RUN_OK'
				else
					# Check Artifacts
					if [[ $BUILD_SUCCESS == true ]] ; then
						STATUS='OK'
						echo "[builder.sh] Exporting artifacts" | tee -a "${LOG_PATH}"

						echo "[builder.sh] OUTFILE: $OUTFILE" | tee -a "${LOG_PATH}"
						# Deploy Artifacts
						cd $(ls -d */)
						echo "[builder.sh] Current workdir: " | tee -a "${LOG_PATH}"
						pwd
						pwd | tee -a "${LOG_PATH}"
						echo "[builder.sh] Current workdir contents: " | tee -a "${LOG_PATH}"
						ls | tee -a "${LOG_PATH}"
						cp -vf *.bin "$OUTFILE" | tee -a "${LOG_PATH}"
						cp -vf *.elf "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
						echo "[builder.sh] Deployment path $DEPLOYMENT_PATH contains:" | tee -a "${LOG_PATH}"
						cp -vR "${OUTFILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"
						ls $DEPLOYMENT_PATH | tee -a "${LOG_PATH}"
						zip -rv "${BUILD_ID}.zip" ${LOG_PATH} ./*.bin ./*.elf # zip artefacts
					else
						STATUS='FAILED'
					fi
				fi
			;;

		platformio)

			THINX_FILE=$( find $BUILD_PATH/$REPO_PATH -name "thinx.h" )

			if [[ -z $THINX_FILE ]]; then
				echo "[builder.sh] WARNING! No THiNX-File found! in $BUILD_PATH/$REPO_PATH: $THINX_FILE" | tee -a "${LOG_PATH}"
				# exit 1 # will deprecate on modularization for more platforms
			else
				echo "[builder.sh] Found THiNX-File: ${THINX_FILE}" | tee -a "${LOG_PATH}"
			fi

			if [[ ! -f "./platformio.ini" ]]; then
				PIO=$(find . -name "platformio.ini")
				echo "PIO: $PIO" | tee -a "${LOG_PATH}"
				PIOD=$(echo $PIO | tr -d "platformio.ini")
				echo "PIOD: $PIOD" | tee -a "${LOG_PATH}"
				if [[ -d "${PIOD}" ]]; then
					echo "[builder.sh] $PIOD is a subdirectory, entering..." | tee -a "${LOG_PATH}"
					cd $PIOD
				else
					echo "[builder.sh] Skipping ${FILE} for there are no PIOS inside..." | tee -a "${LOG_PATH}"
					BUILD_SUCCESS=false
				fi
		  fi

			OUTFILE=$(find / -name "firmware.bin"  -maxdepth 10 | head -n 1)

			if [ ! -f $OUTFILE ]; then
				echo "$OUTFILE not found"
				BUILD_SUCCESS=false
			fi

			echo "[builder.sh] running Docker >>>"
			set -o pipefail
			docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/workspace suculent/platformio-docker-build | tee -a "${LOG_PATH}"
			echo "${PIPESTATUS[@]}"
			if [[ ! -z =$(echo ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
				BUILD_SUCCESS=true
			else
				BUILD_SUCCESS=$?
			fi
			echo "[builder.sh] Docker completed <<<"
			#echo "Current folder contents after build:" | tee -a "${LOG_PATH}"
			#ls | tee -a "${LOG_PATH}"
			#
			OUTFILE=$(find / -name "firmware.bin" -maxdepth 10 | head -n 1)

			if [[ ! -f $OUTFILE ]]; then
				echo "Output file not found, nothing build or path incorrect."
				BUILD_SUCCESS=false
			else
				# Build possible, exit here on dry run...
				if [[ ! ${RUN} ]]; then
					echo "[builder.sh] ☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
					STATUS='DRY_RUN_OK'
				else
					echo "OUTFILE: ${OUTFILE}"
					# Check Artifacts
					if [[ $BUILD_SUCCESS == true ]] ; then
						STATUS='OK'
						ls

						if [[ $(find $(pwd)/ -name "firmware.bin" -type f -size +10000c 2>/dev/null) ]]; then
							# rm -rf $OUTFILE
							BUILD_SUCCESS=false
							echo "[builder.sh] Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
							ls
						else
							echo " " | tee -a "${LOG_PATH}"
							echo "[builder.sh] Docker build succeeded." | tee -a "${LOG_PATH}"
							echo " " | tee -a "${LOG_PATH}"

							# FIXME: Returns errors if no files found
							echo "[builder.sh] ☢ Exporting PlatformIO artifact: ${OUTFILE}"
							cp -vR "${OUTFILE}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
							cp -vR "${OUTFILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"

							zip -rv "${BUILD_ID}.zip" ${OUTFILE} ./build/*.bin ./build/*.elf # zip artefacts
						fi
					else
						STATUS='FAILED'
					fi
				fi
			fi
    ;;

    *)
			MSG="[builder.sh] If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
			echo $MSG; echo $MSG | tee -a "${LOG_PATH}"
      exit 1
    ;;
esac

# cleanup all subdirectories
ls -d  $DEPLOYMENT_PATH/*/ | xargs rm -rf

SHA="0"
MD5="0"

if [[ ! -f "${OUTFILE}" ]]; then
	OUTFILE="<none>"
else
	echo "Calculating checksum for $OUTFILE"
	SHAX=$(shasum -a 256 $OUTFILE)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
	MD5=$(md5 -sq $OUTFILE)
fi

if [[ "${OUTFILE}" == "" ]]; then
	OUTFILE="<none>"
fi

echo "[builder.sh] Build completed with status: $STATUS" | tee -a "${LOG_PATH}"
echo "[builder.sh] Build hash: $SHA" | tee -a "${LOG_PATH}"
echo "[builder.sh] Build MD5: $MD5" | tee -a "${LOG_PATH}"
echo "[builder.sh] Post-flight check:" | tee -a "${LOG_PATH}"

pwd | tee -a "${LOG_PATH}"

#echo "DP" $DISPLAY_DEPLOYMENT_PATH | tee -a "${LOG_PATH}"

# add THINX_FIRMWARE_VERSION to the build.json envelope in order to differ between upgrades and crossgrades
BUILD_FILE=$( find $BUILD_PATH/$REPO_PATH -name "thinx_build.json" )
if [[ -z $BUILD_FILE ]]; then
	BUILD_FILE=$( find $WORKDIR -name "thinx_build.json" )
fi
if [ ! -z ${BUILD_FILE} ]; then
	THINX_FIRMWARE_VERSION="$(jq .THINX_FIRMWARE_VERSION ${BUILD_FILE})"
fi
if [ ! -z ${THINX_FIRMWARE_VERSION} ]; then
	echo "No build file found, generating last-minute version..."
	THINX_FIRMWARE_VERSION="${REPO_NAME}-${THX_VERSION}.${THX_REVISION}"
fi

if [[ -f "${BUILD_ID}.zip" ]]; then
	cp ${BUILD_ID}.zip $TARGET_PATH/
fi

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
echo "PLATFORM" "${PLATFORM}" | tee -a "${LOG_PATH}"
echo "THINX_FIRMWARE_VERSION" "${THINX_FIRMWARE_VERSION}" | tee -a "${LOG_PATH}"
echo "MD5" "${MD5}" | tee -a "${LOG_PATH}"

echo "[builder.sh] Log path: $LOG_PATH" | tee -a "${LOG_PATH}"

#cat $LOG_PATH

# Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope (or stores into DB later)
CMD="${BUILD_ID} ${COMMIT} ${VERSION} ${GIT_REPO} ${OUTFILE} ${UDID} ${SHA} ${OWNER_ID} ${STATUS} ${PLATFORM} ${THINX_FIRMWARE_VERSION}"
echo "[builder.sh] Executing Notifier: " $CMD | tee -a "${LOG_PATH}"
cd $ORIGIN # go back to application root folder
RESULT=$(node $THINX_ROOT/notifier.js $CMD)
echo -e "${RESULT}" | tee -a "${LOG_PATH}"

# Upgrade Platformio in case new version is available (useless until commits its docker image)
#if [[ $RESULT == "*platformio upgrade*" ]]; then
		# echo "Auto-updating platformio..."
		#platformio upgrade > /dev/null
#fi

MSG="${BUILD_DATE} Done."
echo "[builder.sh]" $MSG | tee -a "${LOG_PATH}"
