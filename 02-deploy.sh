#!/bin/bash

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

killall tail # will deprecate

echo
echo "» Fetching current app version from GIT..."

git submodule update --init --recursive # origin master is the default tracking branch

echo
echo "» Re-installing npm packages..."

npm install .

if [[ $CIRCLECI == true ]]; then
	echo
	echo "☢  NOT Running node.js for CI, npm test will start it on its own..."
	# pm2 start index.js

	ACCESS_TOKEN=6aa9f20bef804b75a50338e03830919d
	ENVIRONMENT=test
	LOCAL_USERNAME=`whoami`
	REVISION=`git log -n 1 --pretty=format:"%H"`

	curl https://api.rollbar.com/api/1/deploy/ \
	  -F access_token=$ACCESS_TOKEN \
	  -F environment=$ENVIRONMENT \
	  -F revision=$REVISION \
	  -F local_username=$LOCAL_USERNAME

	#service thinx-app start
	exit 0
else

	echo
	echo "☢  Running node.js as a background process..."

	mkdir logs
	cd /root/thinx-device-api
	pm2 start /root/thinx-device-api/index.js

	ACCESS_TOKEN=6aa9f20bef804b75a50338e03830919d
	ENVIRONMENT=development
	LOCAL_USERNAME=`whoami`
	REVISION=`git log -n 1 --pretty=format:"%H"`

	curl https://api.rollbar.com/api/1/deploy/ \
	  -F access_token=$ACCESS_TOKEN \
	  -F environment=$ENVIRONMENT \
	  -F revision=$REVISION \
	  -F local_username=$LOCAL_USERNAME

	echo
	echo "» Monitoring log. You can exit any time by pressing ^C and logout. Node.js will be still running."
	echo


	if [[ -f ~/.pm2/logs/index-out-0.log ]]; then
		tail -f -n200 ~/.pm2/logs/index-out-0.log
	else
		echo "~/.pm2/logs/index-out-0.log not found, exiting silently..."
	fi
fi
