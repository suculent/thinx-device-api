#!/bin/bash

# Terminate all possible instances
set +e
service thinx stop
forever stopall
killall node
set -e

git pull
# should npm install .

ACCESS_TOKEN=5505bac5dc6c4542ba3bd947a150cb55
ENVIRONMENT=production
LOCAL_USERNAME=`whoami`
REVISION=`git log -n 1 --pretty=format:"%H"`

curl https://api.rollbar.com/api/1/deploy/ \
  -F access_token=$ACCESS_TOKEN \
  -F environment=$ENVIRONMENT \
  -F revision=$REVISION \
  -F local_username=$LOCAL_USERNAME

# Start the server in background
pm2 start index.js

# Watch the log
tail -f ~/.pm2/logs/index-out-0.log
