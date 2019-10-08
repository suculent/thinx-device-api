#!/bin/bash

# Using API Key 'static-test-key' : 88e94c304080d95f7382751d472b39f54d687121

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color
API_KEY='9dea00184411724edee0988431623e03222452e10b9b57b95190e3769d9b2f3e' # satan

function echo_fail() { # $1 = string
    COLOR=$RED
    NC='\033[0m'
    printf "${COLOR}$1${NC}\n"
}

function echo_ok() { # $1 = string
    COLOR=$GREEN
    NC='\033[0m'
    printf "${COLOR}$1${NC}\n"
}

rm -rf cookies.jar

if [[ -z $HOST ]]; then
	HOST='rtm.thinx.cloud'
fi

COUNTER=0
         until [ $COUNTER -gt 4 ]; do
             echo COUNTER $COUNTER
             TEST_DEVICE=$( echo 04-test-devices.json | jq .[$COUNTER] )
             echo $TEST_DEVICE

             echo
             echo "--------------------------------------------------------------------------------"
             echo "☢ Testing device registration..."

             R=$(curl -v \
             -H "Authentication: ${API_KEY}" \
             -H 'Origin: device' \
             -H "User-Agent: THiNX-Client" \
             -H "Content-Type: application/json" \
             -d "${TEST_DEVICE}" \
             https://$HOST:7443/device/register)

             # {"success":false,"status":"authentication"}

             echo $R

             SUCCESS=$(echo $R | tr -d "\n" | jq .registration.success)
             # TODO: Should return rather udid
             if [[ $SUCCESS == true ]]; then
             	echo_ok "Device registration result: $R"
             else
             	echo_fail $R
             fi


             (( COUNTER++ ))
         done
exit 0
