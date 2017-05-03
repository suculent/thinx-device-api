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

service thinx-app status
service thinx-app stop

NODEZ=$(ps -ax | grep "$DAEMON")

if [[ $(echo $NODEZ | wc -l) > 0 ]]; then

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

git pull # origin master is the default tracking branch

echo
echo "» Re-installing npm packages..."

npm install .

if [[ $CIRCLECI == true ]]; then
	echo
	echo "☢  Running node.js without console for CI..."
	nohup node index.js >> /var/log/thinx.log &
	#forever start index.js -lo /var/log/thinx.log
	#service thinx-app start
	exit 0
else

	echo
	echo "☢  Running node.js as a background process..."

	mkdir logs
	nohup node index.js >> /var/log/thinx.log &
	#service thinx-app start

	echo
	echo "» Monitoring log. You can exit any time by pressing ^C and logout. Node.js will be still running."
	echo


	if [[ -f /var/log/thinx.log ]]; then
		tail -f -n200 /var/log/thinx.log
	else
		echo "/var/log/thinx.log not found, exiting silently..."
	fi
fi
