#!/bin/bash
source ./infer # utility functions like parse_yaml

# do not exit when subsequent tools fail...
set +e

echo ""
echo "-=[ ☢   THiNX IoT RTM BUILDER ☢  ]=-"
echo ""

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
		-f=*|--fcid=*)
      FCID="${i#*=}"
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

# will be used later with notifier...
THINX_ROOT=$(pwd)

# from app_config.data_root
DATA_ROOT_X=$(cat $THINX_ROOT/conf/config.json | jq .data_root)
DATA_ROOT="$(sed 's/\"//g' <<< $DATA_ROOT_X)"

# from app_config.build_root
BUILD_ROOT=$DATA_ROOT/repos

# from app_config.deploy_root
OWNER_ID_HOME=$DATA_ROOT/deploy/$OWNER_ID
echo "Owner deployment home: ${OWNER_ID_HOME}"

TARGET_PATH=$DATA_ROOT/deploy/$OWNER_ID/$UDID
echo "Target device deployment path: ${TARGET_PATH}"

DEPLOYMENT_PATH=$OWNER_ID_HOME/$UDID/$BUILD_ID
echo "Deployment path: ${DEPLOYMENT_PATH}"

# Create user-referenced folder in public www space
mkdir -p $OWNER_ID_HOME
mkdir -p $DEPLOYMENT_PATH

LOG_PATH="${DEPLOYMENT_PATH}/build.shell.log"
echo "Log path: $LOG_PATH"
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
echo "Owner workspace: ${OWNER_ID_HOME}" | tee -a "${LOG_PATH}"
echo "Making deployment path: ${DEPLOYMENT_PATH}" | tee -a "${LOG_PATH}"

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

echo "- url: $url" 								| tee -a "${LOG_PATH}"
echo "- proto: $proto" 						| tee -a "${LOG_PATH}"
echo "- user: $user" 							| tee -a "${LOG_PATH}"
echo "- host: $host" 							| tee -a "${LOG_PATH}"
echo "- REPO_PATH: $REPO_PATH" 		| tee -a "${LOG_PATH}"
echo "- REPO_NAME: ${REPO_NAME}" 	| tee -a "${LOG_PATH}"

#echo "Cleaning workspace..."

# Clean


# TODO: only if $REPO_NAME contains slash(es)
BUILD_PATH=$BUILD_ROOT/$OWNER_ID/$UDID/$BUILD_ID
if [[ ! -d $BUILD_PATH ]]; then
	mkdir -p $BUILD_PATH
fi

# Should be already deprecated, as there are pre-fetches. Maybe modules?
echo "Entering build and pulling path..." | tee -a "${LOG_PATH}"
echo $BUILD_PATH | tee -a "${LOG_PATH}"
cd $BUILD_PATH && git pull && pwd | tee -a "${LOG_PATH}"

# Fetch submodules if any
SINK=""
if [[ -d $BUILD_PATH/$REPO_NAME ]]; then
	echo "Directory $REPO_NAME exists, entering..." | tee -a "${LOG_PATH}"
	cd $BUILD_PATH/$REPO_NAME
	SINK=$BUILD_PATH/$REPO_NAME
else
	pwd | tee -a "${LOG_PATH}"
	# ls | tee -a "${LOG_PATH}"
	echo "REPO_NAME ${REPO_NAME} does not exist, entering $REPO_PATH instead..." | tee -a "${LOG_PATH}"
	SINK=$BUILD_PATH/$REPO_PATH
	echo "Entering BUILD_PATH/REPO_PATH" | tee -a "${LOG_PATH}"
	cd $SINK
fi

echo "Updating submodules..." | tee -a "${LOG_PATH}"
git submodule update --init --recursive | tee -a "${LOG_PATH}"

if [[ ! -d $SINK/.git ]]; then
	echo "WARNING! No .git folder on path: $BUILD_PATH/$REPO_PATH/.git" | tee -a "${LOG_PATH}"
else
	cd $SINK | tee -a "${LOG_PATH}"
fi

COMMIT=$(git rev-parse HEAD)
echo "Fetched commit ID: ${COMMIT}" | tee -a "${LOG_PATH}"

VERSION=$(git rev-list HEAD --count)
echo "Repository version/revision: ${VERSION}" | tee -a "${LOG_PATH}"

# Search for thinx.yml

nodemcu_build_type="firmware"
nodemcu_build_float=true

micropython_build_type="firmware"
micropython_platform="esp8266"

YML=$(find $BUILD_PATH/$REPO_PATH -name "thinx.yml")
if [[ ! -z "$YML" ]]; then
	echo "Found ${YML}, reading..." | tee -a "${LOG_PATH}"
	eval $(parse_yaml $YML)
else
		exit 1
fi

# Overwrite Thinx.h file (should be required)

echo "Searching THiNX-File in $BUILD_PATH/$REPO_PATH..." | tee -a "${LOG_PATH}"

if [[ -z $THINX_HOSTNAME ]]; then
	echo "THINX_HOSTNAME must be set!"
	# exit 1
fi

THINX_CLOUD_URL="${THINX_HOSTNAME}"
THINX_MQTT_URL="${THINX_HOSTNAME}"

if [[ ! -z $DEVICE_ALIAS ]]; then
	THINX_ALIAS=$DEVICE_ALIAS
else
	THINX_ALIAS="vanilla"
fi

echo "Changing workdir to ${BUILD_PATH}/${REPO_PATH}"
cd $BUILD_PATH/$REPO_PATH


THX_VERSION="$(git describe --abbrev=0 --tags)"
if [[ $? > 0 ]]; then
	THX_VERSION="1.0"
fi

THX_REVISION="$(git rev-list HEAD --count)"
if [[ $? > 0 ]]; then
	THX_REVISION="1"
fi

REPO_NAME="$( basename $BUILD_PATH/$REPO_PATH )"
BUILD_DATE=$(date +%Y-%m-%d)

# Build

PLATFORM=$(infer_platform $SINK)

echo "[builder] Inferred platform: ${PLATFORM}"

LANGUAGE=$(language_for_platform $PLATFORM)
LANGUAGE_NAME=$(language_name $LANGUAGE)

if [[ -z $PLATFORM ]]; then
	echo "No language. Cannot continue builder."
	exit 1
fi

if [[ -z $LANGUAGE ]]; then
	echo "No language. Cannot continue builder."
	exit 1
fi

echo "Building for platform '${PLATFORM}' in language '${LANGUAGE_NAME}'..." | tee -a "${LOG_PATH}"

SHA="0x00000000"
OUTFILE="<none>"
BUILD_SUCCESS=false

# If running inside Docker, we'll start builders as siblings
if [ -f /.dockerenv ]; then
	DOCKER_PREFIX="-v /var/run/docker.sock:/var/run/docker.sock"
else
	DOCKER_PREFIX=""
fi

cd $WORKDIR

echo "Building in WORKDIR: $(pwd)" | tee -a "${LOG_PATH}"

### DevSec Implementation Begin --> ###

# NOTE: This applies to (C-based) builds only with DevSec support;

# Builder searches for the signature placeholder inside a subfolder.
# (This header should not be placed in project root to prevent being auto-imported;
# which causes duplicate definitions and linker error.)

# Fetches path and rebuilds the signature file if found and all required arguments are available...
SIGNATURE_FILE=$(find . -maxdepth 3 -name "embedded_signature.h")
if [[ ! -z $SIGNATURE_FILE ]]; then
	if [[ -f $SIGNATURE_FILE ]]; then
		# TODO: Validate inputs before doing this... MAC length and FCID length must be exactly 6, etc. Should be implemented in signer.
		if [[ ! -z $FCID && ! -z $MAC && ! -z ${arduino_devsec_ckey} ]]; then
			echo "DevSec building signature into ${SIGNATURE_FILE}" | tee -a "${LOG_PATH}"
			# This makes sure the -c "CKEY" argument does not fall apart due to spaces...
			# in case the CKEY would contain + this needs to be changed to another character, but not \n like in many examples in the wild.
			SAVED_IFS=$IFS
			IFS='+'
			DEVSEC_CONTENTS=$("$THINX_ROOT/devsec" -m ${MAC} -f ${FCID} -s ${arduino_devsec_ssid} -p ${arduino_devsec_pass} -c "${arduino_devsec_ckey}")
			DEVSEC_SUCCESS=$?
			IFS=$SAVED_IFS
			echo "$DEVSEC_CONTENTS" > "$(pwd)/$SIGNATURE_FILE"
			if [[ $DEVSEC_SUCCESS == 0 ]]; then
				echo "DevSec Device Signature file generated..." | tee -a "${LOG_PATH}"
				echo "\n$DEVSEC_CONTENTS" | tee -a "${LOG_PATH}"
			else
				echo "DevSec Failed, keeping signature file unkept." | tee -a "${LOG_PATH}"
				echo $RESULT | tee -a "${LOG_PATH}"
				exit 0
			fi
		else
			echo "[DevSec] Skipping, configuration incomplete..." | tee -a "${LOG_PATH}"
		fi
	else
		echo "[DevSec] Signature file not found at $SIGNATURE_FILE in $(ls)" | tee -a "${LOG_PATH}"
	fi
fi

### <-- DevSec Implementation End ###




### Builder Implementation Begin --> ###

case $PLATFORM in

		nodejs)

			# WARNING! This is a specific builder.
			# Should only copy. Basic NodeJS client supports git and should fetch repo on its own.

			OUTFILE=${DEPLOYMENT_PATH}/build
			touch $OUTFILE
			#	zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" | tee -a "${LOG_PATH}" ./* # zip artefacts
			BUILD_SUCCESS=true
			echo "There's nothing to build on NodeJS projects." | tee -a "${LOG_PATH}"
			OUTPATH=${DEPLOYMENT_PATH}

			# ls | tee -a "${LOG_PATH}"

			if [[ ! ${RUN} ]]; then
				echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "NodeJS Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					# ls | tee -a "${LOG_PATH}"
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
				zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" | tee -a "${LOG_PATH}" ./* # zip artefacts
			else
				echo "Build type: firmware (or undefined)" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
				if [[ -z $(find $OUTFILE -type f -size +10000c 2>/dev/null) ]]; then
					rm -rf $OUTFILE
					BUILD_SUCCESS=false
					echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
				fi
			fi

			OUTPATH=${DEPLOYMENT_PATH}

			echo "Micropython Build: Customizing firmware..." | tee -a "${LOG_PATH}"

			UPY_FILES=$(find $WORKDIR -name *.py)

			for pyfile in ${UPY_FILES[@]}; do
				if [[ $BUILD_TYPE == "firmware" ]]; then
					FSPATH=$WORKDIR/$(basename ${pyfile}) # we should already stand in this folder
					if [[ -f $FSPATH ]]; then
						rm -rf $FSPATH
						cp -vf "${pyfile}" $FSPATH
						zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${pyfile} ./* # zip artefacts
					fi
				else
					cp -vf "${pyfile}" "$DEPLOYMENT_PATH"
					zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${pyfile} ./* # zip artefacts
				fi
			done

			if [[ $BUILD_TYPE == "firmware" ]]; then
				echo "Micropython Build: Running Dockerized builder..." | tee -a "${LOG_PATH}"
				set -o pipefail
				docker run ${DOCKER_PREFIX} --rm -t -v $(pwd)/modules:/micropython/esp8266/modules --workdir /micropython/esp8266 thinx-micropython | tee -a "${LOG_PATH}"
				echo "${PIPESTATUS[@]}"
				if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
					BUILD_SUCCESS=true
					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
					zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/** # zip artefacts
				fi
				if [[ -z $(find $OUTFILE -type f -size +10000c 2>/dev/null) ]]; then
					rm -rf $OUTFILE
					BUILD_SUCCESS=false
					echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
				fi
				echo "[micropython] Docker completed <<<"
				rm -rf ./build; make clean; make V=1
			fi

			# ls | tee -a "${LOG_PATH}"

			if [[ ! ${RUN} ]]; then
				echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "NodeMCU Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					# ls | tee -a "${LOG_PATH}"
					echo "NodeMCU Build: Listing binary artifacts: " | tee -a "${LOG_PATH}"
					# ls ./bin | tee -a "${LOG_PATH}"
					if [[ $BUILD_TYPE == "firmware" ]]; then
						cp -v ./build/*.bin "$OUTPATH" | tee -a "${LOG_PATH}"
						zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
						rm -rf ./build/*
					fi
					echo "Micropython Build: DEPLOYMENT_PATH: " $DEPLOYMENT_PATH
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
				echo "Build type: file" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/thinx.lua
				zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ${OUTFILE} # zip artefacts
			else
				echo "Build type: firmware (or undefined)" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
				zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ${OUTFILE} # zip artefacts
				if [[ -z $(find $OUTFILE -type f -size +10000c 2>/dev/null) ]]; then
					rm -rf $OUTFILE
					BUILD_SUCCESS=false
					echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
				fi
			fi

			OUTPATH=${DEPLOYMENT_PATH}

			echo "NodeMCU Build: Cleaning SPIFFS folder..." | tee -a "${LOG_PATH}"
			if [ -f ${DEPLOYMENT_PATH}/local/fs/* ]; then
				echo "Cleaning local/fs" | tee -a "${LOG_PATH}"
				# rm -rf ${DEPLOYMENT_PATH}/local/fs/** # cleanup first
			fi

			# Copy firmware sources to current working directory
			cp -vfR $THINX_ROOT/builders/nodemcu-firmware/* .

			CONFIG_PATH="./local/fs/thinx.json"

			if [ -f $CONFIG_PATH ]; then
				echo "NodeMCU Build: Deconfiguring..." | tee -a "${LOG_PATH}"
				rm -rf $CONFIG_PATH
			fi

			echo "NodeMCU Build: Configuring..." | tee -a "${LOG_PATH}"
			mv "./thinx_build.json" $CONFIG_PATH

			FILES=$(find . -maxdepth 1 -name "*.lua")
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
				echo "running Docker >>>"
				set -o pipefail
				docker run ${DOCKER_PREFIX} --rm -t ${DOCKER_PARAMS} -v `pwd`:/opt/nodemcu-firmware suculent/nodemcu-docker-build | tee -a "${LOG_PATH}"
				echo "${PIPESTATUS[@]}"
				if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
					BUILD_SUCCESS=true
					zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./bin/* # zip artefacts
				fi
				echo "[nodemcu] Docker completed <<<"

			else
				# deploy Lua files without building
				cp -vf *.lua "$DEPLOYMENT_PATH"
				zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ${FILES} # zip artefacts
			fi

			if [[ ! ${RUN} ]]; then
				echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				if [[ $BUILD_SUCCESS == true ]] ; then
					echo "NodeMCU Build: Listing output directory: " | tee -a "${LOG_PATH}"
					pwd | tee -a "${LOG_PATH}"
					# ls | tee -a "${LOG_PATH}"
					echo "NodeMCU Build: Listing binary artifacts: " | tee -a "${LOG_PATH}"
					# ls ./bin | tee -a "${LOG_PATH}"
					if [[ $BUILD_TYPE == "firmware" ]]; then
						echo "NodeMCU Build: Copying binary artifacts..." | tee -a "${LOG_PATH}"
						cp -v "./bin/${OUTFILE_PREFIX}*.bin" "${DEPLOYMENT_PATH}/firmware.bin" | tee -a "${LOG_PATH}"
					fi
					echo "NodeMCU Build: DEPLOYMENT_PATH: " $DEPLOYMENT_PATH
					# ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./bin/* # zip artefacts
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
			echo "Moving thinx_build.json to $TNAME" | tee -a "${LOG_PATH}"
			mv "./thinx_build.json" "$TNAME"

			DCMD="docker run ${DOCKER_PREFIX} --rm -t -v $(pwd):/opt/mongoose-builder suculent/mongoose-docker-build"
			echo "running Docker ${DCMD} >>>" | tee -a "${LOG_PATH}"
			set -o pipefail
			"$DCMD"
			echo "${PIPESTATUS[@]}"
			if [[ ! -z =$(echo ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
				if [[ -f $(pwd)/build/fw.zip ]]; then
					BUILD_SUCCESS=true
					zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
				else
					echo "OUTFILE not created." | tee -a "${LOG_PATH}"
				fi
			fi
			echo "[mongoose] Docker completed <<<"
			echo "mongoose ls:"
			ls

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					STATUS='OK'
					cp $(pwd)/build/fw.zip $OUTFILE
					# ls "$BUILD_PATH/build" | tee -a "${LOG_PATH}"
					unzip "${BUILD_PATH}/build/fw.zip" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					# ls "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					echo "[builder.sh]" $MSG; echo $MSG | tee -a "${LOG_PATH}"
					zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
				else
					STATUS='FAILED'
				fi
			fi
    ;;

		arduino)

			THINX_FILE=$( find $BUILD_PATH/$REPO_PATH -name "thinx.h" )

			if [[ -z $THINX_FILE ]]; then
				echo "[arduino] WARNING! No THiNX-File found! in $BUILD_PATH/$REPO_PATH: $THINX_FILE" | tee -a "${LOG_PATH}"
				# exit 1 # will deprecate on modularization for more platforms
			else
				echo "[arduino] Using THiNX-File: ${THINX_FILE/$(pwd)//}" | tee -a "${LOG_PATH}"
			fi

			cd $BUILD_PATH/$REPO_PATH

			OUTFILE=${DEPLOYMENT_PATH}/firmware.bin

			set -o pipefail
			echo "Docker: Starting THiNX Arduino Builder Container..."

			DCMD="docker run ${DOCKER_PREFIX} -t -v $(pwd):/opt/workspace suculent/arduino-docker-build"
			$DCMD | tee -a "${LOG_PATH}"
			echo "PIPESTATUS ${PIPESTATUS[@]}" | tee -a "${LOG_PATH}"
			set +o pipefail

			echo "Contents of working directory after build:" | tee -a "${LOG_PATH}"
			ls -la $BUILD_PATH/$REPO_PATH/build | tee -a "${LOG_PATH}"

			echo "[arduino] Docker completed <<<" | tee -a "${LOG_PATH}"

			if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
				BUILD_SUCCESS=true
				# TODO: FIXME, can be more binfiles with partitions!
				BIN_FILE=$( find $BUILD_PATH/$REPO_PATH -name "*.bin" | head -n 1)
				echo "BIN_FILE: ${BIN_FILE}" | tee -a "${LOG_PATH}"

				if [[ ! -f $BIN_FILE ]]; then
					echo "BIN_FILE $BIN_FILE not found!"
					BUILD_SUCCESS=false
					exit 1
				fi

				# once again with size limit
				if [[ -z $(find $BUILD_PATH/$REPO_PATH -name "*.bin" -type f -size +10000c 2>/dev/null) ]]; then
					BUILD_SUCCESS=false
					echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
					# ls -la | tee -a "${LOG_PATH}"
				else
					echo "Docker build succeeded." | tee -a "${LOG_PATH}"
					echo " " | tee -a "${LOG_PATH}"
					echo "BIN_FILE: $BIN_FILE" | tee -a "${LOG_PATH}"
					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
					zip -r "${BUILD_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ${BIN_FILE} ./build/**
				fi
			else
				echo "[arduino] Docker build with result ${RESULT}" | tee -a "${LOG_PATH}"
			fi

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					STATUS='OK'
					echo "Exporting artifacts" | tee -a "${LOG_PATH}"
					echo "Expected OUTFILE: ${OUTFILE}" | tee -a "${LOG_PATH}"
					# Deploy Artifacts

					if [[ ! -z ./build ]]; then
						echo "Entering ./build" | tee -a "${LOG_PATH}"
						cd ./build | tee -a "${LOG_PATH}"
					fi

					#echo "Current workdir: " | tee -a "${LOG_PATH}"
					#pwd | tee -a "${LOG_PATH}"
					#echo "Current workdir contents: " | tee -a "${LOG_PATH}"
					#ls | tee -a "${LOG_PATH}"

					echo "Copying deployment data..." | tee -a "${LOG_PATH}"

					echo "to: ${OUTFILE}" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$OUTFILE" | tee -a "${LOG_PATH}"

					echo "to: ${TARGET_PATH}" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"

					echo "to: ${DEPLOYMENT_PATH}" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					cp -vf "${LOG_PATH}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					# TODO: cp -vf "${BUILD_JSON_PATH}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"

					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
					zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/*.bin ./build/*.elf # zip artefacts

					echo "Current path: ${DEPLOYMENT_PATH} " | tee -a "${LOG_PATH}"
					ls -la | tee -a "${LOG_PATH}"
					echo "Deployment path: ${DEPLOYMENT_PATH} " | tee -a "${LOG_PATH}"
					ls -la ${DEPLOYMENT_PATH} | tee -a "${LOG_PATH}"
					echo "Target path: ${DEPLOYMENT_PATH} " | tee -a "${LOG_PATH}"
					ls -la ${TARGET_PATH} | tee -a "${LOG_PATH}"
					echo "Cleaning up..." | tee -a "${LOG_PATH}"
					rm -rf $BUILD_PATH/$REPO_PATH | tee -a "${LOG_PATH}"
				else
					STATUS='FAILED'
				fi
			fi
		;;

		platformio)

			THINX_FILE=$( find $BUILD_PATH/$REPO_PATH -name "thinx.h" )

			if [[ -z $THINX_FILE ]]; then
				echo "[platformio] WARNING! No THiNX-File found! in $BUILD_PATH/$REPO_PATH: $THINX_FILE" | tee -a "${LOG_PATH}"
				# exit 1 # will deprecate on modularization for more platforms
			else
				echo "[platformio] Using THiNX-File ${THINX_FILE}" | tee -a "${LOG_PATH}"
			fi

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
					BUILD_SUCCESS=false
				fi
		  fi

			OUTFILE=$(find $BUILD_PATH -name "firmware.bin" | head -n 1)

			if [ ! -f $OUTFILE ]; then
				echo "$OUTFILE not found"
				BUILD_SUCCESS=false
			fi

			echo "running Docker PIO >>>"
			set -o pipefail
			DCMD=$(docker run ${DOCKER_PREFIX} --rm -t -v `pwd`:/opt/workspace suculent/platformio-docker-build)
			echo $DCMD | tee -a "${LOG_PATH}"
			echo "${PIPESTATUS[@]}"
			if [[ ! -z =$(echo ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
				BUILD_SUCCESS=true
			else
				BUILD_SUCCESS=$?
			fi
			echo "[platformio] Docker completed <<<"

			echo "Current folder contents after build:" | tee -a "${LOG_PATH}"
			ls | tee -a "${LOG_PATH}"
			echo "Current folder contents after build:" | tee -a "${LOG_PATH}"
			ls $BUILD_PATH | tee -a "${LOG_PATH}"

			OUTFILE=$(find $BUILD_PATH -name "firmware.bin" -maxdepth 10 | head -n 1)

			if [[ ! -f $OUTFILE ]]; then
				echo "Output file not found, nothing build or path incorrect."
				BUILD_SUCCESS=false
			else
				# Build possible, exit here on dry run...
				if [[ ! ${RUN} ]]; then
					echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
					STATUS='DRY_RUN_OK'
				else
					echo "OUTFILE: ${OUTFILE}"
					# Check Artifacts
					if [[ $BUILD_SUCCESS == true ]] ; then
						STATUS='OK'
						# ls

						if [[ -z $(find $(pwd)/ -name "firmware.bin" -type f -size +10000c 2>/dev/null) ]]; then
							# rm -rf $OUTFILE
							BUILD_SUCCESS=false
							echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
							ls
						else
							echo " " | tee -a "${LOG_PATH}"
							echo "Docker build succeeded." | tee -a "${LOG_PATH}"
							echo " " | tee -a "${LOG_PATH}"

							# FIXME: Returns errors if no files found
							echo "☢ Exporting PlatformIO artifact: ${OUTFILE}"
							cp -vR "${OUTFILE}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
							cp -vR "${OUTFILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"

							echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
							zip -r "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${OUTFILE} ./build/*.bin ./build/*.elf # zip artefacts
						fi
					else
						STATUS='FAILED'
					fi
				fi
			fi
    ;;

    *)
			MSG="If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
			echo $MSG; echo $MSG | tee -a "${LOG_PATH}"
      exit 1
    ;;
esac

cd $DEPLOYMENT_PATH
pwd | tee -a "${LOG_PATH}"
# cleanup all subdirectories?
# echo "Cleaning all subdirectories in deployment path..."
# ls -d  $DEPLOYMENT_PATH/* | xargs rm -rf | tee -a "${LOG_PATH}"

SHA="0"
MD5="0"

if [[ ! -f "${OUTFILE}" ]]; then
	echo "Could not find outfile $OUTFILE"
	OUTFILE="<none>"
else
	echo "Calculating checksum for $OUTFILE"
	SHAX=$(shasum -a 256 $OUTFILE)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
	MD5=$(md5sum "$OUTFILE" | cut -d ' ' -f 1)
fi

if [[ "${OUTFILE}" == "" ]]; then
	OUTFILE="<none>"
fi

echo "Build completed with status: $STATUS" | tee -a "${LOG_PATH}"

echo "Post-flight check:" | tee -a "${LOG_PATH}"
pwd | tee -a "${LOG_PATH}"

# add THINX_FIRMWARE_VERSION to the build.json envelope in order to differ between upgrades and crossgrades
BUILD_FILE=$( find $BUILD_PATH/$REPO_PATH -name "thinx_build.json" )
if [[ -z $BUILD_FILE ]]; then
	BUILD_FILE=$( find $WORKDIR -name "thinx_build.json" )
fi
if [ ! -z ${BUILD_FILE} ]; then
	echo "Fetching version from thinx_build.json" | tee -a "${LOG_PATH}"
	THINX_FIRMWARE_VERSION="$(jq .THINX_FIRMWARE_VERSION ${BUILD_FILE})"
fi
if [ -z ${THINX_FIRMWARE_VERSION} ]; then
	TAG_VERSION=$(git describe --abbrev=0 --tags)
	THINX_FIRMWARE_VERSION="${REPO_NAME}-${TAG_VERSION}"
	echo "No thinx_build.json file found, generating last-minute version: ${THINX_FIRMWARE_VERSION}"
fi

if [[ -f "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ]]; then
	cp "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" $TARGET_PATH
fi

echo "BUILD_ID" "${BUILD_ID}" | tee -a "${LOG_PATH}"
#echo "COMMIT" "${COMMIT}" | tee -a "${LOG_PATH}"
echo "THX_VERSION" "${THX_VERSION}" | tee -a "${LOG_PATH}"
echo "GIT_REPO" "${GIT_REPO}" | tee -a "${LOG_PATH}"
echo "OUTFILE" "${OUTFILE}" | tee -a "${LOG_PATH}"
echo "DEPLOYMENT_PATH" "${DEPLOYMENT_PATH}" | tee -a "${LOG_PATH}"
echo "UDID" "${UDID}" | tee -a "${LOG_PATH}"
#echo "SHA" "${SHA}" | tee -a "${LOG_PATH}"
#echo "OWNER_ID" "${OWNER_ID}" | tee -a "${LOG_PATH}"
echo "STATUS" "${STATUS}" | tee -a "${LOG_PATH}"
echo "PLATFORM" "${PLATFORM}" | tee -a "${LOG_PATH}"
echo "THINX_FIRMWARE_VERSION" "${THINX_FIRMWARE_VERSION}" | tee -a "${LOG_PATH}"
#echo "MD5" "${MD5}" | tee -a "${LOG_PATH}"

#echo "Log path: $LOG_PATH" | tee -a "${LOG_PATH}"
#cat $LOG_PATH

# Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope (or stores into DB later)
CMD="${BUILD_ID} ${COMMIT} ${THX_VERSION} ${GIT_REPO} ${OUTFILE} ${UDID} ${SHA} ${OWNER_ID} ${STATUS} ${PLATFORM} ${THINX_FIRMWARE_VERSION} ${MD5}"
echo "Executing Notifier." | tee -a "${LOG_PATH}"
cd $ORIGIN # go back to application root folder
RESULT=$(node $THINX_ROOT/notifier.js $CMD)
echo -e "${RESULT}" | tee -a "${LOG_PATH}"

MSG="${BUILD_DATE} Done."
echo "[builder.sh]" $MSG | tee -a "${LOG_PATH}"
