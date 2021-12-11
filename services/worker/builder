#!/bin/bash

if [[ ! -f ./infer ]]; then
	echo "Infer tool missing!"
	exit 1
fi

source ./infer # utility functions like parse_yaml

if [[ -z $THINX_ROOT ]]; then
export THINX_ROOT=/opt/thinx/thinx-device-api
fi

echo ""
echo "-=[ ☢  THiNX IoT WORKER BUILDER " $(jq .version < package.json) " ☢  ]=-"
echo "."

# do not exit when subsequent tools fail...
set +e

# Swarm Support

random-string()
{
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w ${1:-32} | head -n 1
}

NODE_ID=$(docker info -f {{.Swarm.NodeID}})

# RETURNS ERROR IF /var/run/docker.sock is not readable by worker!

SWARM=false
if [[ -z $NODE_ID ]]; then
        echo "SWARM ERROR! Make sure /var/run/docker.sock is readable by the worker on this node!"
		SWARM=false
else
        echo "This is a swarm node ${NODE_ID}"
		SWARM=true
fi

BUILD_IMAGE=suculent/arduino-docker-build

swarm-build()
{
	#echo "Examining networks..."
	# docker network ls returns --network cz-kgr-thinx_internal \

	LOG_PATH=$3
	BUILD_IMAGE=$2
	WORKDIR=$1

	# will deprecate with passing the var
	if [[ -z $COUNTRY ]]; then
		COUNTRY=cz
	fi

	# Restores internal to external mount path for service outside this container
	FIND="\/mnt\/data\/repos"
	REPLACE="\/mnt\/data\/thinx\/$COUNTRY\/repos"
	WORKDIR=$(echo "$WORKDIR" | sed "s/$FIND/$REPLACE/")
	UNIQUE_NAME="thinx_build-$(random-string 16)"

	SERVICE_COMMAND="docker service create \
	--restart-condition=none \
	--mount type=bind,source=/var/run/docker.sock,destination=/var/run/docker.sock \
	--container-label owner=thinx \
	--limit-cpu=1 \
	--replicas=1 \
	--reserve-memory=750MB \
	--name $UNIQUE_NAME \
	--mount type=bind,source=$WORKDIR,destination=/opt/workspace \
	--mount type=bind,source=/mnt/data/thinx/$COUNTRY/deploy,destination=/mnt/data/deploy \
	--mount type=bind,source=/mnt/data/thinx/$COUNTRY/repos,destination=/mnt/data/repos \
	$BUILD_IMAGE"

	# echo "$SERVICE_COMMAND"
	echo "Starting Build Service..."

	$SERVICE_COMMAND

	echo "» Extracting Docker Service Log:"
	INFO=$(docker service ls | grep $UNIQUE_NAME)
	echo $INFO
	ITERATIONS=0

	# 15 seconds x 4 = 1 minute; 4 x 15 minutes (max build duration) = 60
	MAX_ITERATIONS=60
	RUNNING=true

	# write logs in background; should be killed later
	docker service logs $UNIQUE_NAME | tee -a "$LOG_PATH" &

	while $RUNNING
	do
		((ITERATIONS++))
		sleep 30

		DSTATUS=$(docker service ls | grep  $UNIQUE_NAME)
		echo $DSTATUS

		# if grep -q "replicated\t1/1" <<< "$DSTATUS"
		if grep -q "1/1" <<< "$DSTATUS"; then
			echo "Still running..."
		fi

		if grep -q "task: non-zero exit" <<< "$DSTATUS"; then
			echo "Service task failure."
			docker service rm $UNIQUE_NAME
			RUNNING=false
		fi

		# if grep -q "replicated\t0/0" <<< "$DSTATUS"
		if grep -q "0/0" <<< "$DSTATUS"; then
			echo "Build completed."
			# append service logs to catch THINX BUILD SUCCESSFUL phrase; serves to decide to extract OUTFILE laters
			docker service logs $UNIQUE_NAME | tee -a "$LOG_PATH"
			# might get cleaned a bit later, but how do we do that? tagging?
			docker service rm $UNIQUE_NAME
			RUNNING=false
		fi

		if [[ "$DSTATUS" == *"No such image"* ]]; then
			echo "Service image failure."
			docker service rm $UNIQUE_NAME
			RUNNING=false
		fi

		if [[ "$DSTATUS" == *"invalid"* ]]; then
			echo "Service configuration failure."
			docker service rm $UNIQUE_NAME
			RUNNING=false
		fi

		if [[ "$ITERATIONS" -ge "$MAX_ITERATIONS" ]]; then
			echo "Build Timed Out, terminating service."
			docker service rm $UNIQUE_NAME
			RUNNING=false
		fi
	done
}

# Default/mock values only

OWNER_ID='cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12' # name of folder where workspaces reside
RUN=true # dry-run switch
DEVICE='UNKNOWN' # builds for no device by default, not even ANY
OPEN=false # show build result in Finder
BUILD_ID='test-build-id'
ORIGIN=$(pwd)
UDID='f8e88e40-43c8-11e7-9ad3-b7281c2b9610'
GIT_BRANCH='origin/master'
ENV_HASH='cafebabe' # default hardcoded in firmware 

# ./builder --id=test-build-id --owner=cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12 --udid=a80cc610-4faf-11e7-9a9c-41d4f7ab4083 --git=git@github.com:suculent/thinx-firmware-esp8266.git --branch=origin/master

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
	-b=*|--branch=*)
      GIT_BRANCH="${i#*=}"
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

# later used in DevSec and NodeMCU
CONFIG_ROOT=$(pwd)
if [[ ! -f $CONFIG_ROOT/conf/config.json ]]; then
	CONFIG_ROOT=/mnt/data
fi

if [ -f $CONFIG_ROOT/conf/config.json ]; then
# from app_config.data_root
DATA_ROOT_X=$(cat $CONFIG_ROOT/conf/config.json | jq .data_root)
DATA_ROOT="$(sed 's/\"//g' <<< $DATA_ROOT_X)"
else
DATA_ROOT=/mnt/data
fi

# from app_config.build_root
BUILD_ROOT=$DATA_ROOT/repos

# from app_config.deploy_root
OWNER_ID_HOME=$DATA_ROOT/deploy/$OWNER_ID

TARGET_PATH=$DATA_ROOT/deploy/$OWNER_ID/$UDID
echo "Target path    : ${TARGET_PATH}"

echo "-"

DEPLOYMENT_PATH=$OWNER_ID_HOME/$UDID/$BUILD_ID
echo "Deployment path: ${DEPLOYMENT_PATH}"

echo "-"

mkdir -p $DEPLOYMENT_PATH
chmod -R 777 $DEPLOYMENT_PATH

touch $DEPLOYMENT_PATH/.write

if [[ ! -f $DEPLOYMENT_PATH/.write ]]; then
	echo "ERROR: Deployment path $DEPLOYMENT_PATH not writable by Worker shell! Exiting build."
	exit 6
fi

# Create user-referenced folder in public www space

LOG_PATH="${DEPLOYMENT_PATH}/build.log"
if [[ ! -f $LOG_PATH ]]; then
	echo "Creating new logfile at: $LOG_PATH"
else
	echo "Found existing logfile at: $LOG_PATH"
	cat $LOG_PATH
fi

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

## Following works for the HTTPS protocol, not GIT+SSL
# remove the protocol
url="$(echo ${GIT_REPO/$proto/})"
user="$(echo $url | grep @ | cut -d@ -f1)"
host="$(echo ${url/$user@/} | cut -d/ -f1)"

# by request - try to extract the port; support custom git ports in future
port="$(echo $host | sed -e 's,^.*:,:,g' -e 's,.*:\([0-9]*\).*,\1,g' -e 's,[^0-9],,g')"
if [[ -z $port ]]; then
  port=22
fi

REPO_PATH="$(echo $url | grep / | cut -d/ -f2-)"
REPO_NAME="$(echo $url | grep / | cut -d/ -f3-)"

echo

if [[ "$user" == "git" ]]; then
  	echo "Overriding for user git and git-ssl..." | tee -a "${LOG_PATH}"
	proto="git-ssl"
	len=${#REPO_NAME}
	OLDHOST=$host

    echo "host-x:        $host" | tee -a "${LOG_PATH}"

	GIT_PATH=$REPO_PATH
	REPO_PATH="$(sed 's/.git//g' <<< $GIT_PATH)"
	REPO_NAME="$(echo $url | grep / | cut -d/ -f2-)"
    echo "REPO_NAME C:   $REPO_NAME" | tee -a "${LOG_PATH}"
	user="$(echo $OLDHOST | grep : | cut -d: -f2-)"
    host="$(echo $OLDHOST | grep : | cut -d: -f1)"
else
	echo "In git-https mode, user is also from url..." | tee -a "${LOG_PATH}"
  	user=$(echo $url | grep / | cut -d/ -f2-)
  	user=$(echo $user | grep / | cut -d/ -f1)
fi

echo

# make sure to remove trailing git for HTTP URLs as well...
# REPO_PATH=$BUILD_PATH/${REPO_PATH%.git}
REPO_PATH=${REPO_PATH%.git}
REPO_NAME=${REPO_NAME%.git}

# TODO: only if $REPO_NAME contains slash(es)
BUILD_PATH=$BUILD_ROOT/$OWNER_ID/$UDID/$BUILD_ID
if [[ ! -d $BUILD_PATH ]]; then
	mkdir -p $BUILD_PATH
fi

echo $BUILD_PATH | tee -a "${LOG_PATH}"
cd $BUILD_PATH
#ls -la | tee -a "${LOG_PATH}"

# Fetch submodules if any
SINK=""
if [[ -d $BUILD_PATH/$REPO_NAME ]]; then
	echo "Directory $REPO_NAME exists, entering..." | tee -a "${LOG_PATH}"
	cd $BUILD_PATH/$REPO_NAME
	SINK=$BUILD_PATH/$REPO_NAME
	cd $SINK
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

VERSION=$(git rev-list --all --count)
echo "Repository version/revision: ${VERSION}" | tee -a "${LOG_PATH}"

# Search for thinx.yml

nodemcu_build_type="firmware"
nodemcu_build_float=true

micropython_build_type="firmware"
micropython_platform="esp8266"

YML=$(find $BUILD_PATH/$REPO_NAME -name "thinx.yml")
if [[ ! -z "$YML" ]]; then
	#echo "Found ${YML}, reading..." | tee -a "${LOG_PATH}"
	echo "Reading thinx.yml build configuration..."
	eval $(parse_yaml $YML)
else
		exit 1
fi

# Overwrite Thinx.h file (should be required)

echo "Searching THiNX-File in $BUILD_PATH/$REPO_NAME..." | tee -a "${LOG_PATH}"

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

echo "Changing workdir to ${BUILD_PATH}/${REPO_NAME}"
cd $BUILD_PATH/$REPO_NAME


THX_VERSION="$(git describe --abbrev=0 --tags)"
if [[ $? > 0 ]]; then
	THX_VERSION="1.0"
fi

THX_REVISION="$(git rev-list --all --count)"
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

echo "Running DevSec..." | tee -a "${LOG_PATH}"

### DevSec Implementation Begin --> ###

# NOTE: This applies to (C-based) builds only with DevSec support;

# Builder searches for the signature placeholder inside a subfolder.
# (This header should not be placed in project root to prevent being auto-imported;
# which causes duplicate definitions and linker error.)

# Fetche SSID and PASS for DevSec
ENVS=$(find $BUILD_PATH/$REPO_NAME -name "environment.json" | head -n 1)
if [[ ! -f $ENVS ]]; then
	echo "No environment.json found" | tee -a "${LOG_PATH}"
else
	if [ ! -f $THINX_FILE ]; then
		echo "WTF THINX_FILE does not exist?" | tee -a "${LOG_PATH}"
	else
		# DEPRECATED: Use ENV_SSID and ENV_PASS to set devsec_ssid and devsec_pass 
		# Actually in latest code, credentials are transmitted and stored at rest in CouchDB encrypted using transfer_key.
		# On build those are pushed to thinx.yml overwriting devsec.ssid and devsec.pass keys using ENVIRONMENT_CSSID and ENVIRONMENT_CPASS 
		# From point of view, storing those values in environment.json is incorrect, because this file should not contain CSSID and CPASS (but only global SSID and PASS if any)

		if [[ ! -f $ENVS ]]; then
			echo "No environment.json found" | tee -a "${LOG_PATH}"
		else
			echo "Overriding DevSec values from: ${ENVS}" | tee -a "${LOG_PATH}"
			echo
			
			while IFS='' read -r keyname; do
				
				VAL=$(jq '.'$keyname $ENVS)

				if [[ ${keyname} == "pass" ]]; then
					devsec_pass=$(echo ${VAL} | sed 's/^"//;s/\"*$//') # trim leading/trailing '\"'
					echo "Overriding devsec_pass: ${devsec_pass}" | tee -a "${LOG_PATH}"
				fi

				if [[ ${keyname} == "ssid" ]]; then
					devsec_ssid=$(echo ${VAL} | sed 's/^"//;s/\"*$//') # trim leading/trailing '\"'
					echo "Overriding devsec_ssid: ${devsec_ssid}" | tee -a "${LOG_PATH}"
				fi

				if [[ ${keyname} == "ckey" ]]; then
					devsec_ckey=$(echo ${VAL} | sed 's/^"//;s/\"*$//') # trim leading/trailing '\"'
					echo "Overriding devsec_ckey: ${devsec_ckey}" | tee -a "${LOG_PATH}"
				fi

			done < <(jq -r 'keys[]' $ENVS)
		fi
	fi
fi

# Fetches path and rebuilds the signature file if found and all required arguments are available...
SIGNATURE_FILE=$(find . -maxdepth 3 -name "embedded_signature.h")
if [[ ! -z $SIGNATURE_FILE ]]; then
	if [[ -f $SIGNATURE_FILE ]]; then
		# TODO: Validate inputs before doing this... MAC length and FCID length must be exactly 6, etc. Should be implemented in signer.
		if [[ ! -z $FCID && ! -z $MAC && ! -z ${devsec_ckey} ]]; then
			echo "DevSec building signature into ${SIGNATURE_FILE}" | tee -a "${LOG_PATH}"
			# This makes sure the -c "CKEY" argument does not fall apart due to spaces...
			# in case the CKEY would contain + this needs to be changed to another character, but not \n like in many examples in the wild.

			# WARNING! INSECURE DEBUG! Remove when not needed.
			echo "[REM DevSec] MAC: ${MAC}" | tee -a "${LOG_PATH}"
			echo "[REM DevSec] FCID: ${FCID}" | tee -a "${LOG_PATH}"
			echo "[REM DevSec] devsec_ssid: ${devsec_ssid}" | tee -a "${LOG_PATH}"
			echo "[REM DevSec] devsec_pass: ${devsec_pass}" | tee -a "${LOG_PATH}"
			echo "[REM DevSec] devsec_ckey: ${devsec_ckey}" | tee -a "${LOG_PATH}"

			SAVED_IFS=$IFS
			IFS='+'
			DEVSEC_CONTENTS=$("$THINX_ROOT/devsec" -m ${MAC} -f ${FCID} -s ${devsec_ssid} -p ${devsec_pass} -c "${devsec_ckey}")
			DEVSEC_SUCCESS=$?
			IFS=$SAVED_IFS
			
			if [[ $DEVSEC_SUCCESS == 0 ]]; then
				echo "$DEVSEC_CONTENTS" > "$(pwd)/$SIGNATURE_FILE"
				echo "DevSec Device Signature file generated..." | tee -a "${LOG_PATH}"
				echo "$DEVSEC_CONTENTS" > "${LOG_PATH}"
			else
				echo "DevSec Failed, keeping signature file intact." | tee -a "${LOG_PATH}"
				echo $RESULT | tee -a "${LOG_PATH}"
				exit 0
			fi
		else
			echo "[DevSec] Skipping, configuration incomplete. FCID: $FCID, MAC: $MAC, CKEY: ${devsec_ckey} " | tee -a "${LOG_PATH}"
		fi
	else
		echo "[DevSec] Signature file not found at $SIGNATURE_FILE in $(ls)" | tee -a "${LOG_PATH}"
	fi
fi

### <-- DevSec Implementation End ###

echo "Building for ${PLATFORM} in WORKDIR: $(pwd)" | tee -a "${LOG_PATH}"

### Builder Implementation Begin --> ###

case $PLATFORM in

		nodejs)

			# WARNING! This is a specific builder.
			# Should only copy. Basic NodeJS client supports git and should fetch repo on its own.

			OUTFILE=${DEPLOYMENT_PATH}/build
			touch $OUTFILE
			#	zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" | tee -a "${LOG_PATH}" ./* # zip artefacts
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
				zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" | tee -a "${LOG_PATH}" ./* # zip artefacts
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
						zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${pyfile} ./* # zip artefacts
					fi
				else
					cp -vf "${pyfile}" "$DEPLOYMENT_PATH"
					zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${pyfile} ./* # zip artefacts
				fi
			done

			if [[ $SWARM == false ]]; then
				if [[ $BUILD_TYPE == "firmware" ]]; then
					echo "Micropython Build: Running Dockerized builder..." | tee -a "${LOG_PATH}"
					set -o pipefail
					docker pull suculent/micropython-docker-build
					docker run ${DOCKER_PREFIX} --cpus=1.0 --rm -t -v $(pwd)/modules:/micropython/esp8266/modules --workdir /micropython/esp8266 suculent/micropython-docker-build | tee -a "${LOG_PATH}"
					echo "${PIPESTATUS[@]}"
					set +o pipefail
					if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
						BUILD_SUCCESS=true
						echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
						zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/** # zip artefacts
					fi
					if [[ -z $(find $OUTFILE -type f -size +10000c 2>/dev/null) ]]; then
						rm -rf $OUTFILE
						BUILD_SUCCESS=false
						echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
					fi
					echo "[micropython] Docker completed <<<"
				fi
			else
				swarm-build $WORKDIR suculent/micropython-docker-build $LOG_PATH
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
						zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
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
			if [[ $DROP_INTEGER_USE_FLOAT == true ]]; then
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
				zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ${OUTFILE} # zip artefacts
			else
				echo "Build type: firmware (or undefined)" | tee -a "${LOG_PATH}"
				OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
				zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ${OUTFILE} # zip artefacts
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
			cp "./thinx_build.json" $CONFIG_PATH

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

				
				if [[ $SWARM == false ]]; then
					echo "NodeMCU Build: Running Dockerized builder..." | tee -a "${LOG_PATH}"
					echo "running Docker >>>"
					set -o pipefail
					docker pull suculent/nodemcu-docker-build
					docker run ${DOCKER_PREFIX} --cpus=1.0 --rm -t ${DOCKER_PARAMS} -v `pwd`:/opt/nodemcu-firmware suculent/nodemcu-docker-build | tee -a "${LOG_PATH}"
					echo "${PIPESTATUS[@]}"
					if [[ ! -z $(cat ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
						BUILD_SUCCESS=true
						zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./bin/* # zip artefacts
					fi
					echo "[nodemcu] Docker completed <<<"
				else
					swarm-build $WORKDIR suculent/micropython-docker-build $LOG_PATH
				fi
				
			else
				# deploy Lua files without building
				cp -vf *.lua "$DEPLOYMENT_PATH"
				zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ${FILES} # zip artefacts
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
					zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./bin/* # zip artefacts
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
			cp "./thinx_build.json" "$TNAME"

			if [[ $SWARM == false ]]; then
				docker pull suculent/mongoose-docker-build
				DCMD="docker run ${DOCKER_PREFIX} --cpus=1.0 --rm -t -v $(pwd):/opt/mongoose-builder suculent/mongoose-docker-build"
				echo "running Docker ${DCMD} >>>" | tee -a "${LOG_PATH}"
				set -o pipefail
				"$DCMD"
				echo "${PIPESTATUS[@]}"
				if [[ ! -z $(echo ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
					if [[ -f $(pwd)/build/fw.zip ]]; then
						BUILD_SUCCESS=true
						zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
					else
						echo "OUTFILE not created." | tee -a "${LOG_PATH}"
					fi
				fi
				echo "[mongoose] Docker completed <<<"
			else
				swarm-build $WORKDIR suculent/mongoose-docker-build $LOG_PATH
			fi

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
					zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/* # zip artefacts
				else
					STATUS='FAILED'
				fi
			fi
    ;;

		arduino)

			cd $BUILD_PATH/$REPO_NAME
			#pwd
			#ls

			THINX_FILE=$( find . -name "thinx.h"  | head -n 1)

			if [[ -z $THINX_FILE ]]; then
				echo "[arduino] WARNING! No THiNX-File found! in $BUILD_PATH/$REPO_NAME: $THINX_FILE" | tee -a "${LOG_PATH}"
				# exit 1 # will deprecate on modularization for more platforms
			else
				#echo "[arduino] Using THiNX-File: ${THINX_FILE/$(pwd)//}" | tee -a "${LOG_PATH}"
				echo "[arduino] Using THiNX-File: ${THINX_FILE}" | tee -a "${LOG_PATH}"
				ENVOUT=$(find $BUILD_PATH/$REPO_NAME -name "environment.json" | head -n 1)
				if [[ ! -f $ENVOUT ]]; then
					echo "No environment.json found"
				else
					if [ ! -f $THINX_FILE ]; then
						echo "WTF THINX_FILE does not exist?"
					else
						echo "[arduino] Will write ENV_HASH to ${THINX_FILE}"
						ENV_HASH=$(shasum -a 256 ${ENVOUT} | awk '{ print $1 }')
						LINE="#define ENV_HASH \"${ENV_HASH}\""
						sed -i '/ENV_HASH/d' ${THINX_FILE}
						echo -e ${LINE} >> ${THINX_FILE}
					fi
				fi
			fi

			OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
			#WORKDIR=$(pwd)

			if [[ $SWARM == false ]]; then
				set -o pipefail
				echo "Docker: Starting THiNX Arduino Builder Container in folder" $(pwd)
				docker pull suculent/arduino-docker-build
				DCMD="docker run ${DOCKER_PREFIX} --cpus=1.0 -t -v $(pwd):/opt/workspace suculent/arduino-docker-build"
				echo "command: ${DCMD}"
				$DCMD | tee -a "${LOG_PATH}"
				#echo "PIPESTATUS ${PIPESTATUS[@]}" | tee -a "${LOG_PATH}"
				set +o pipefail
			else
				swarm-build $WORKDIR suculent/arduino-docker-build $LOG_PATH
			fi

			echo "[arduino] Docker completed <<<" | tee -a "${LOG_PATH}"

			if [[ -f ${WORKDIR}/firmware.bin ]]; then
				BUILD_SUCCESS=true
				# TODO: FIXME, can be more binfiles with partitions!
				BIN_FILE=$( find $BUILD_PATH/$REPO_NAME -name "*.bin" | head -n 1)
				echo "BIN_FILE: ${BIN_FILE}" | tee -a "${LOG_PATH}"

				if [[ ! -f $BIN_FILE ]]; then
					echo "BIN_FILE $BIN_FILE not found!"
					BUILD_SUCCESS=false
					exit 1
				fi

				# once again with size limit
				if [[ -z $(find $BUILD_PATH/$REPO_NAME -name "*.bin" -type f -size +10000c 2>/dev/null) ]]; then
					BUILD_SUCCESS=false
					echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
					# ls -la | tee -a "${LOG_PATH}"
				else
					echo "Docker build succeeded." | tee -a "${LOG_PATH}"
					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
					zip -rq "${BUILD_PATH}/${BUILD_ID}.zip" ${BIN_FILE} ./build/**
				fi
			else
				echo "[arduino] Docker build failed, no firmware.bin found." | tee -a "${LOG_PATH}"
			fi

			# Exit on dry run...
			if [[ ! ${RUN} ]]; then
				echo "☢ Dry-run ${BUILD_ID} completed. Skipping actual deployment." | tee -a "${LOG_PATH}"
				STATUS='DRY_RUN_OK'
			else
				# Check Artifacts
				if [[ $BUILD_SUCCESS == true ]] ; then
					STATUS='OK'
					echo "Exporting artifacts..." | tee -a "${LOG_PATH}"
					# Deploy Artifacts

					if [[ ! -d ./build ]]; then
						# echo "Entering ./build" | tee -a "${LOG_PATH}"
						cd ./build | tee -a "${LOG_PATH}"
					fi

					echo "Copying deployment data..." | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$OUTFILE" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					# TODO: cp -vf "${BUILD_JSON_PATH}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"

					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
					zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/*.bin ./build/*.elf # zip artefacts

				else
					STATUS='FAILED'
				fi
			fi
		;;

		pine64)

			cd $BUILD_PATH/$REPO_NAME
			pwd
			ls

			THINX_FILE=$( find . -name "thinx.h"  | head -n 1)

			if [[ -z $THINX_FILE ]]; then
				echo "[pine64] WARNING! No THiNX-File found! in $BUILD_PATH/$REPO_NAME: $THINX_FILE" | tee -a "${LOG_PATH}"
				# exit 1 # will deprecate on modularization for more platforms
			else
				#echo "[pine64] Using THiNX-File: ${THINX_FILE/$(pwd)//}" | tee -a "${LOG_PATH}"
				echo "[pine64] Using THiNX-File: ${THINX_FILE}" | tee -a "${LOG_PATH}"
				ENVOUT=$(find $BUILD_PATH/$REPO_NAME -name "environment.json" | head -n 1)
				if [[ ! -f $ENVOUT ]]; then
					echo "No environment.json found"
				else
					if [ ! -f $THINX_FILE ]; then
						echo "WTF THINX_FILE does not exist?"
					else
						echo "[pine64] Will write ENV_HASH to ${THINX_FILE}"
						ENV_HASH=$(shasum -a 256 ${ENVOUT} | awk '{ print $1 }')
						LINE="#define ENV_HASH \"${ENV_HASH}\""
						sed -i '/ENV_HASH/d' ${THINX_FILE}
						echo -e ${LINE} >> ${THINX_FILE}
					fi
				fi
			fi

			OUTFILE=${DEPLOYMENT_PATH}/firmware.bin
			WORKDIR=$(pwd)

			if [[ $SWARM == false ]]; then
				set -o pipefail
				echo "Docker: Starting THiNX Arduino Builder Container in folder" $(pwd)
				docker pull suculent/pine64-docker-build
				DCMD="docker run ${DOCKER_PREFIX} --cpus=1.0 -t -v $(pwd):/opt/workspace suculent/pine64-docker-build"
				echo "command: ${DCMD}"
				$DCMD | tee -a "${LOG_PATH}"
				#echo "PIPESTATUS ${PIPESTATUS[@]}" | tee -a "${LOG_PATH}"
				set +o pipefail
			else
				swarm-build $WORKDIR suculent/pine64-docker-build $LOG_PATH
			fi

			echo "[pine64] Docker completed <<<" | tee -a "${LOG_PATH}"

			if [[ ! -z $(grep 'THiNX BUILD SUCCESSFUL' ${LOG_PATH}) ]]; then
				BUILD_SUCCESS=true
				# TODO: FIXME, can be more binfiles with partitions!
				BIN_FILE=$( find $BUILD_PATH/$REPO_NAME -name "*.bin" | head -n 1)
				echo "BIN_FILE: ${BIN_FILE}" | tee -a "${LOG_PATH}"

				if [[ ! -f $BIN_FILE ]]; then
					echo "BIN_FILE $BIN_FILE not found!"
					BUILD_SUCCESS=false
					exit 1
				fi

				# once again with size limit
				if [[ -z $(find $BUILD_PATH/$REPO_NAME -name "*.bin" -type f -size +10000c 2>/dev/null) ]]; then
					BUILD_SUCCESS=false
					echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
					# ls -la | tee -a "${LOG_PATH}"
				else
					echo "Docker build succeeded." | tee -a "${LOG_PATH}"
					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
					zip -rq "${BUILD_PATH}/${BUILD_ID}.zip" ${BIN_FILE} ./build/**
				fi
			else
				echo "[pine64] Docker build with result failed, no BUILD SUCCESSFUL message found in log." | tee -a "${LOG_PATH}"
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

					if [[ ! -f "./build" ]]; then
						# echo "Entering ./build" | tee -a "${LOG_PATH}"
						cd ./build | tee -a "${LOG_PATH}"
					fi

					echo "Copying deployment data..." | tee -a "${LOG_PATH}"

					#echo "to: ${OUTFILE}" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$OUTFILE" | tee -a "${LOG_PATH}"

					#echo "to: ${TARGET_PATH}" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"

					#echo "to: ${DEPLOYMENT_PATH}" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					
					# TODO: cp -vf "${BUILD_JSON_PATH}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"

					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"
					zip -rq "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ${LOG_PATH} ./build/*.bin ./build/*.elf # zip artefacts

				else
					STATUS='FAILED'
				fi
			fi
		;;

		platformio)

			cd $BUILD_PATH/$REPO_NAME

			THINX_FILE=$( find . -name "thinx.h"  | head -n 1)

			echo "[platformio] pio thinx.h check stage... $_THINX_FILE"

			if [[ -z $THINX_FILE ]]; then
				echo "[platformio] WARNING! No THiNX-File found! in $BUILD_PATH/$REPO_NAME: $THINX_FILE" | tee -a "${LOG_PATH}"
				# exit 1 # will deprecate on modularization for more platforms
			else
				#echo "[platformio] Using THiNX-File: ${THINX_FILE/$(pwd)//}" | tee -a "${LOG_PATH}"
				echo "[platformio] Using THiNX-File: ${THINX_FILE}" | tee -a "${LOG_PATH}"
				ENVOUT=$(find $BUILD_PATH/$REPO_NAME -name "environment.json" | head -n 1)
				if [[ ! -f $ENVOUT ]]; then
					echo "No environment.json found"
				else
					if [ ! -f $THINX_FILE ]; then
						echo "WTF THINX_FILE does not exist?"
					else
						echo "[platformio] Will write ENV_HASH to ${THINX_FILE}"
						ENV_HASH=$(shasum -a 256 ${ENVOUT} | awk '{ print $1 }')
						LINE="#define ENV_HASH \"${ENV_HASH}\""
						sed -i '/ENV_HASH/d' ${THINX_FILE}
						echo -e ${LINE} >> ${THINX_FILE}
					fi
				fi
			fi

			echo "[platformio] pio check stage..."

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

			echo "[platformio] build stage... swarm: $SWARM"

			if [[ $SWARM == false ]]; then
				echo "running Docker PIO >>>"
				set -o pipefail
				docker pull suculent/platformio-docker-build
				DCMD=$(docker run ${DOCKER_PREFIX} --cpus=1.0 --rm -t -v `pwd`:/opt/workspace suculent/platformio-docker-build)
				echo $DCMD | tee -a "${LOG_PATH}"
				echo "${PIPESTATUS[@]}"
				if [[ ! -z $(echo ${LOG_PATH} | grep "THiNX BUILD SUCCESSFUL") ]] ; then
					BUILD_SUCCESS=true
				else
					BUILD_SUCCESS=$?
				fi
			else
				swarm-build $WORKDIR suculent/platformio-docker-build $LOG_PATH
			fi

			echo "[platformio] Docker completed <<<" | tee -a "${LOG_PATH}"

			# echo "Current .pio/build folder contents after build:" | tee -a "${LOG_PATH}"
			# ls ./.pio/build | tee -a "${LOG_PATH}"

			OUTFILE=$(pwd)/$(find . -name "*.bin" | head -n 1)
			
			echo "[platformio] OUTFILE ${OUTFILE}" | tee -a "${LOG_PATH}"

			if [ ! -f $OUTFILE ]; then
				echo "$OUTFILE not found" | tee -a "${LOG_PATH}"
				BUILD_SUCCESS=false
			else
				BUILD_SUCCESS=true
				STATUS='OK'
				BIN_FILE=$OUTFILE

				echo "OUTFILE: ${OUTFILE}" | tee -a "${LOG_PATH}"

				if [[ ! -f $OUTFILE ]]; then
					echo "OUTFILE $OUTFILE not found!" | tee -a "${LOG_PATH}"
					BUILD_SUCCESS=false
					exit 1
				fi

				# once again with size limit
				if [[ -z $(find $BUILD_PATH/$REPO_NAME -name "*.bin" -type f -size +10000c 2>/dev/null) ]]; then
					BUILD_SUCCESS=false
					echo "Docker build failed, build artifact size is below 10k." | tee -a "${LOG_PATH}"
					# ls -la | tee -a "${LOG_PATH}"
				else
					echo "Docker build succeeded." | tee -a "${LOG_PATH}"
					echo "Zipping artifacts to ${BUILD_ID}.zip..." | tee -a "${LOG_PATH}"

					zip -rq "${BUILD_PATH}/${BUILD_ID}.zip" ${BIN_FILE} ./build/**


					echo "Copying deployment data..." | tee -a "${LOG_PATH}"

					cp -vf "${BIN_FILE}" "$TARGET_PATH" | tee -a "${LOG_PATH}"
					cp -vf "${BIN_FILE}" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
					cp -vf "${BUILD_PATH}/${BUILD_ID}.zip" "$DEPLOYMENT_PATH" | tee -a "${LOG_PATH}"
				fi

			fi
			
			echo "[platformio] Docker build completed with BUILD_SUCCESS ${BUILD_SUCCESS}" | tee -a "${LOG_PATH}"
			
		;;
	*)
		MSG="If you need to support your platform, file a ticket at https://github.com/suculent/thinx-device-api/issues"
		echo $MSG; echo $MSG | tee -a "${LOG_PATH}"
		exit 1
		;;
esac

cd $DEPLOYMENT_PATH
# pwd | tee -a "${LOG_PATH}"
#ls -la
# cleanup all subdirectories?
# echo "Cleaning all subdirectories in deployment path..."
# ls -d  $DEPLOYMENT_PATH/* | xargs rm -rf | tee -a "${LOG_PATH}"

SHA="0"
MD5="0"

if [[ ! -f "${OUTFILE}" ]]; then
	FIND="\/mnt\/data\/deploy"
	REPLACE="\/mnt\/data\/thinx\/$COUNTRY\/deploy"
	OUTFILE=$(echo "$OUTFILE" | sed "s/$FIND/$REPLACE/")
	if [[ ! -f "${OUTFILE}" ]]; then
		echo "Could not find outfile $OUTFILE anywhere..." | tee -a "${LOG_PATH}"
		OUTFILE=""
	fi
fi

if [[ "${OUTFILE}" != "" ]]; then
	echo "Calculating checksum for $OUTFILE" | tee -a "${LOG_PATH}"
	SHAX=$(shasum -a 256 $OUTFILE)
	SHA="$(echo $SHAX | grep " " | cut -d" " -f1)"
	MD5=$(md5sum "$OUTFILE" | cut -d ' ' -f 1)
fi

if [[ "${OUTFILE}" == "" ]]; then
	OUTFILE="<none>"
fi

echo "[builder] Build Stage completed with status: $STATUS" | tee -a "${LOG_PATH}"

echo "[builder] Post-flight check..." | tee -a "${LOG_PATH}"

# add THINX_FIRMWARE_VERSION to the build.json envelope in order to differ between upgrades and crossgrades
BUILD_FILE=$( find $BUILD_PATH/$REPO_NAME -name "thinx_build.json" )
if [[ -z $BUILD_FILE ]]; then
	BUILD_FILE=$( find $WORKDIR -name "thinx_build.json" )
fi
if [ ! -z ${BUILD_FILE} ]; then
	THINX_FIRMWARE_VERSION=$(jq .THINX_FIRMWARE_VERSION ${BUILD_FILE} | tr -d '"')
	#echo "[builder] THINX_FIRMWARE_VERSION=$THINX_FIRMWARE_VERSION" | tee -a "${LOG_PATH}"
fi
if [ -z ${THINX_FIRMWARE_VERSION} ]; then
	pushd $BUILD_PATH/$REPO_NAME
	TAG_VERSION=$(git describe --abbrev=0 --tags)
	popd
	THINX_FIRMWARE_VERSION=${REPO_NAME}-${TAG_VERSION}
	echo "[builder] No thinx_build.json file found, generating last-minute version: ${THINX_FIRMWARE_VERSION}" | tee -a "${LOG_PATH}"
fi

if [[ -f "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" ]]; then
	cp -v "${DEPLOYMENT_PATH}/${BUILD_ID}.zip" $TARGET_PATH
fi

if [[ $WORKER==1 ]]; then

# Inside Worker, we don't call notifier, but just post the results into shell... THiNX builder must then call the notifier itself (or integrate it later)
JSON=$(jo \
build_id=${BUILD_ID} \
commit=${COMMIT} \
thx_version=${THX_VERSION} \
git_repo=${GIT_REPO} \
outfile=$(basename ${OUTFILE}) \
udid=${UDID} \
sha=${SHA} \
owner=${OWNER_ID} \
status=${STATUS} \
platform=${PLATFORM} \
version=${THINX_FIRMWARE_VERSION} \
md5=${MD5} \
env_hash=${ENV_HASH} \
)

echo "JOB-RESULT: $JSON" | tee -a "${LOG_PATH}"

else

echo "BUILD_ID" "${BUILD_ID}" | tee -a "${LOG_PATH}"
echo "COMMIT" "${COMMIT}" | tee -a "${LOG_PATH}"
echo "THX_VERSION" "${THX_VERSION}" | tee -a "${LOG_PATH}"
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
echo "ENV_HASH" "${ENV_HASH}" | tee -a "${LOG_PATH}"


# Calling notifier is a mandatory on successful builds, as it creates the JSON build envelope (or stores into DB later)
CMD="node ./notifier.js ${BUILD_ID} ${COMMIT} ${THX_VERSION} ${GIT_REPO} ${OUTFILE} ${UDID} ${SHA} ${OWNER_ID} ${STATUS} ${PLATFORM} ${THINX_FIRMWARE_VERSION} ${MD5} ${ENV_HASH}"
CMD=$(echo $CMD | tr -d '"')
echo "[builder] Executing Notifier with command ${CMD}" | tee -a "${LOG_PATH}"
cd $ORIGIN # go back to application root folder
pwd
#ls
RESULT=$($CMD)
echo -e "E_RESULT: ${RESULT}" | tee -a "${LOG_PATH}"
echo "RESULT: ${RESULT}" | tee -a "${LOG_PATH}"

# rm -rf $BUILD_PATH # not a good idea, seems to destroy build.json (envelope)

MSG=""

fi