#!/bin/bash

rm -rf cookies.jar

echo
echo "--------------------------------------------------------------------------------"
echo "☢ Testing device registration..."

curl -v \
-H 'Authentication: 3d7c1c8d5c0bbe1da084ca634ce07fd617fa468c' \
-H 'Origin: device' \
-H "User-Agent: THiNX-Client" \
-H "Content-Type: application/json" \
-d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "version" : "1.0.0", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "dhho4djVGeQ:APA91bFuuZWXDQ8vSR0YKyjWIiwIoTB1ePqcyqZFU3PIxvyZMy9htu9LGPmimfzdrliRfAdci-AtzgLCIV72xmoykk-kHcYRhAFWFOChULOGxrDi00x8GgenORhx_JVxUN_fjtsN5B7T", "alias" : "rabbit", "owner": "test" } }' \
http://$HOST:7442/device/register

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
curl -v -c cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "username" : "test", "password" : "tset" }' \
http://$HOST:7442/api/login

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching device catalog..."

curl -v -b cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/devices

echo
echo "--------------------------------------------------------------------------------"
echo "» Requesting new apikey..."

curl -v -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{}' \
http://$HOST:7442/api/user/apikey

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching user apikeys..."

curl -v -b cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/apikey/list

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching user sources..."

curl -v -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/sources/list

echo
echo "--------------------------------------------------------------------------------"
echo "» Pushing RSA key..."

curl -v -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-d '{ "alias" : "name", "key" : "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC0PF7uThKgcEwtBga4gRdt7tiPmxzRhJgxUdUrNKj0z4rDhs09gmXyN1EBH3oATJOMwdZ7J19eP/qRFK+bbkOacP6Hh0+eCr54bySpqyNPAeQFFXWzLXJ6t/di/vH0deutYBNH6S5yVz+Df/04IjoVIf+AMDYA8ppJ3WtBm0Qp/1UjYDM3Hc93JtDwr6AUoq/k0oAroP4ikL2gyXnmVjMX0DIkBwEScXhFDi1X6u6PWvFPLeZeB5MWQUo+VnBwFctExOmEt3RWJdwv7s8uRnoaFDA2OxlQ8cMWjCx0Z/aftl8AaV/TwpFTc1Fz/LhZ54Ud3s4usHji9720aAkSXGfD test@thinx.cloud"}' \
http://$HOST:7442/api/user/rsakey

echo
echo "--------------------------------------------------------------------------------"
echo "» Fetching RSA keys..."

curl -v -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
http://$HOST:7442/api/user/rsakey/list


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
