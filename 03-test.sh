#!/bin/bash

echo
echo "☢ Running NYC code coverage..."

HOST="thinx.cloud"
HOST="localhost"

nyc --reporter=lcov --reporter=text-lcov npm test

echo
echo "☢ Karma..."

karma start

echo
echo "☢ Testing device registration..."

curl -v \
-H 'Authentication: 4ae7fa8276e4cd6e61e8a3ba133f2c237176e8d5' \
-H 'Origin: device' \
-H "User-Agent: THiNX-Client" \
-H "Content-Type: application/json" \
-X POST -d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "version" : "1.0.0", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "dhho4djVGeQ:APA91bFuuZWXDQ8vSR0YKyjWIiwIoTB1ePqcyqZFU3PIxvyZMy9htu9LGPmimfzdrliRfAdci-AtzgLCIV72xmoykk-kHcYRhAFWFOChULOGxrDi00x8GgenORhx_JVxUN_fjtsN5B7T", "alias" : "rabbit", "owner": "test" } }' \
http://$HOST:7442/device/register

echo
echo "☢ Testing builder..."

curl -H "Origin: rtm.thinx.cloud" -H "User-Agent: THiNX-Client" -H "Content-Type: application/json" -X POST -d '{ "build" : { "mac" : "ANY", "owner" : "test", "git" : "https://github.com/suculent/thinx-firmware-esp8266", "dryrun" : true } }' http://thinx.cloud:7442/api/build

echo
echo "» Testing authentication..."

# Get access cookie by authentication
curl -v -c cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "username" : "test", "password" : "tset" }' \
http://$HOST:7442/api/login

echo
echo "» Fetching device catalog..."

curl -v -b cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "query" : false }' http://$HOST:7442/api/view/devices

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

