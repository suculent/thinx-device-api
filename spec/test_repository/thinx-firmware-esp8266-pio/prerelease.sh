#!/bin/bash

echo
echo "-=[ THiNX: Overriding header ]=-"
echo

# Use this before your own internal releases. Build server does it automatically.

THINX_FILE=$(find . | grep "/thinx.h")
THINX_OWNER="cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12" # todo: override with parameter
THINX_ALIAS="vanilla" # todo: override with parameter
THINX_CLOUD_URL="rtm.thinx.cloud" # IP causes crashes
THINX_MQTT_URL="${THINX_CLOUD_URL}" # mqtt://?

REPO_NAME='thinx-firmware-esp8266'
VERSION=$(git rev-list HEAD --count)
REPO_VERSION="1.9.${VERSION}"
BUILD_DATE=`date +%Y-%m-%d`

echo "//" > "$THINX_FILE"
echo "// This is an auto-generated file, it will be re-written by THiNX on cloud build." >> "$THINX_FILE"
echo "//" >> "$THINX_FILE"

echo "" >> "$THINX_FILE"

echo "#define THINX_COMMIT_ID \"$(git rev-parse HEAD)\"" >> "$THINX_FILE"
echo "#define THINX_MQTT_URL \"${THINX_MQTT_URL}\"" >> "$THINX_FILE"
echo "#define THINX_CLOUD_URL \"${THINX_CLOUD_URL}\"" >> "$THINX_FILE"
echo "#define THINX_FIRMWARE_VERSION = \"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\"" >> "$THINX_FILE"
echo "#define THINX_FIRMWARE_VERSION_SHORT = \"${REPO_VERSION}\"" >> "$THINX_FILE"
echo "#define THINX_APP_VERSION = \"${REPO_NAME}-${REPO_VERSION}:${BUILD_DATE}\"" >> "$THINX_FILE"

# dynamic variables
echo "#define THINX_OWNER \"${THINX_OWNER}\"" >> "$THINX_FILE"
echo "#define THINX_ALIAS \"${THINX_ALIAS}\"" >> "$THINX_FILE"
echo "#define THINX_API_KEY \"\"" >> "$THINX_FILE"

# debug only
echo "#define THINX_UDID \"\"" >> "$THINX_FILE"

echo "" >> "$THINX_FILE"

echo "#define THINX_MQTT_PORT 1883" >> "$THINX_FILE"
echo "#define THINX_API_PORT 7442" >> "$THINX_FILE"
