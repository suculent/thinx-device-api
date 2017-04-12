#!/bin/bash

DAEMON="node index.js"

echo
echo "☢ Checking environment..."

if [[ $(uname) == "Darwin" ]]; then
	echo "» SERVER ONLY: This script is not intended to run on workstation."
	echo
	exit 1
fi

echo
echo "☢ Checking if node.js is running..."

NODEZ=$(ps -ax | grep $DAEMON)

echo $NODEZ

echo "${NODEZ}" | while IFS="\t" read A B ; do 
	echo $A
done


echo "☢ Fetching current app version from GIT..."

git pull origin master

echo "☢ Running node as a background process..."

nohup node index.js > thinx.log &

echo "☢ Monitoring log. You can exit any time by pressing ^C and logout. Node.js will be still running."

tail -f thinx.log

