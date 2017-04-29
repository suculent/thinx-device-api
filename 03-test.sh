#!/bin/bash

rm -rf cookies.jar

if [[ -z $HOST ]]; then
	HOST='localhost'
fi

echo
echo "--------------------------------------------------------------------------------"
echo "☢ Testing device registration..."

curl -v \
-H 'Authentication: 19e0e3f2b16c013af092f1e0584a3fda11fd18e2' \
-H 'Origin: device' \
-H "User-Agent: THiNX-Client" \
-H "Content-Type: application/json" \
-d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "version" : "1.0.0", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "dhho4djVGeQ:APA91bFuuZWXDQ8vSR0YKyjWIiwIoTB1ePqcyqZFU3PIxvyZMy9htu9LGPmimfzdrliRfAdci-AtzgLCIV72xmoykk-kHcYRhAFWFOChULOGxrDi00x8GgenORhx_JVxUN_fjtsN5B7T", "alias" : "rabbit", "owner": "test" } }' \
http://$HOST:7442/device/register

echo
echo "--------------------------------------------------------------------------------"
echo "☢ Testing firmware update (owner test)..."

curl -v \
-H 'Authentication: 19e0e3f2b16c013af092f1e0584a3fda11fd18e2' \
-H 'Origin: device' \
-H "User-Agent: THiNX-Client" \
-H "Content-Type: application/json" \
-d '{ "mac" : "00:00:00:00:00:00", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "commit" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "checksum" : "02e2436d60c629e2ab6357d0d314dd6fe28bd0331b18ca6b19a25cd6f969d0a8", "owner" : "test"  }' \
http://$HOST:7442/device/firmware

echo
echo "--------------------------------------------------------------------------------"
echo "☢ Testing builder..."

curl -H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Client" \
-H "Content-Type: application/json" \
-d '{ "build" : { "udid" : "47fc9ab2-2227-11e7-8584-4c327591230d", "mac" : "ANY", "owner" : "test", "git" : "git@github.com:suculent/thinx-firmware-esp8266.git", "dryrun" : true } }' \
http://$HOST:7442/api/build

echo
echo "--------------------------------------------------------------------------------"
echo "» Testing authentication..."

# Get access cookie by authentication
curl -c cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "username" : "test", "password" : "tset" }' \
http://$HOST:7442/api/login

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching device catalog..."

curl -b cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/devices

echo
echo "--------------------------------------------------------------------------------"
echo "» Requesting new API Key..."

R=$(curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{}' \
http://$HOST:7442/api/user/apikey)

# {"success":true,"api_key":"ece10e3effb17650420c280a7d5dce79110dc084"}

SUCCESS=$(echo '$R' | jq .success)
APIKEY="b7c2d19da39deba81e360c1d61b386dbd5a8bc5d93f8bd40e3f74510a24e8cb0"
if [[ $SUCCESS == true ]]; then
	APIKEY=$(echo '$R' | jq .api_key)
	echo "New key to revoke: $APIKEY"
fi

echo
echo "--------------------------------------------------------------------------------"
echo "» Revoking API Key..."

curl -v -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "fingerprint" : "${APIKEY}" }' \
http://$HOST:7442/api/user/apikey/revoke

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching API Keys..."

curl -v -b cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/apikey/list

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching user sources..."

curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/sources/list

echo
echo "--------------------------------------------------------------------------------"
echo "» Revoking RSA key..."

curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "fingerprint" : "d3:04:a5:05:a2:11:ff:44:4b:47:15:68:4d:2a:f8:93" }' \
http://$HOST:7442/api/user/rsakey/revoke

echo
echo "--------------------------------------------------------------------------------"
echo "» Pushing RSA key..."

curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "alias" : "name", "key" : "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC0PF7uThKgcEwtBga4gRdt7tiPmxzRhJgxUdUrNKj0z4rDhs09gmXyN1EBH3oATJOMwdZ7J19eP/qRFK+bbkOacP6Hh0+eCr54bySpqyNPAeQFFXWzLXJ6t/di/vH0deutYBNH6S5yVz+Df/04IjoVIf+AMDYA8ppJ3WtBm0Qp/1UjYDM3Hc93JtDwr6AUoq/k0oAroP4ikL2gyXnmVjMX0DIkBwEScXhFDi1X6u6PWvFPLeZeB5MWQUo+VnBwFctExOmEt3RWJdwv7s8uRnoaFDA2OxlQ8cMWjCx0Z/aftl8AaV/TwpFTc1Fz/LhZ54Ud3s4usHji9720aAkSXGfD test@thinx.cloud" }' \
http://$HOST:7442/api/user/rsakey

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching RSA keys..."

curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/rsakey/list

echo
echo "--------------------------------------------------------------------------------"
echo "» Testing source add..."

curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "url" : "https://github.com/suculent/thinx-firmware-esp8266.git", "alias" : "thinx-firmware-esp8266" }' \
http://$HOST:7442/api/user/source

echo
echo "--------------------------------------------------------------------------------"
echo "» Testing source detach..."

curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "mac" : "00:00:00:00:00:00" }' \
http://$HOST:7442/api/device/detach

echo
echo "--------------------------------------------------------------------------------"
echo "» Testing source attach..."

curl -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "mac" : "00:00:00:00:00:00", "alias" : "thinx-test-repo" }' \
http://$HOST:7442/api/device/attach


#echo
#echo "☢ Running NYC code coverage..."
#
#HOST="thinx.cloud"
#HOST="localhost"
#
#nyc --reporter=lcov --reporter=text-lcov npm test

#echo
#echo "☢ Skipping Karma..."

# karma start

exit 0

echo
echo "» Terminating node.js..."

DAEMON="node index.js"
NODEZ=$(ps -ax | grep "$DAEMON")

if [[ $(echo $NODEZ | wc -l) > 1 ]]; then

	echo "${NODEZ}" | while IFS="pts" read A B ; do
		NODE=$($A | tr -d ' ')
		echo "Killing: " $NODE $B
		kill "$NODE"
	done

else
	echo "${NODEZ}"
fi
