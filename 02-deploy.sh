#!/bin/bash

DAEMON="node index.js"

echo
echo "☢  THiNX RE-DEPLOYMENT STARTED ☢"
echo
echo "» Checking environment..."

if [[ $(uname) == "Darwin" ]]; then
	echo "» SERVER ONLY: This script is not intended to run on workstation."
	echo
	exit 1
fi

echo
echo "» Checking if node.js is running..."

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

echo
echo "» Fetching current app version from GIT..."

git pull origin master

echo
echo "☢  Running node.js as a background process..."

nohup node index.js > ./logs/thinx.log

echo
echo "» Monitoring log. You can exit any time by pressing ^C and logout. Node.js will be still running."
echo

if [[ -f ./logs/thinx.log ]]; then
	tail -f ./logs/thinx.log
else
	echo "./logs/thinx.log not found, exiting silently..."
fi
