#!/bin/bash


# optional
# git pull
# npm install .

# Restarts the server using `forever` process manager

# Terminate all possible instances
set +e
service thinx stop
killall node
forever stopall
set -e

git pull

# Start the server in background
nohup forever -o /var/log/thinx.log index.js &

ACCESS_TOKEN=5505bac5dc6c4542ba3bd947a150cb55
ENVIRONMENT=production
LOCAL_USERNAME=`whoami`
REVISION=`git log -n 1 --pretty=format:"%H"`

curl https://api.rollbar.com/api/1/deploy/ \
  -F access_token=$ACCESS_TOKEN \
  -F environment=$ENVIRONMENT \
  -F revision=$REVISION \
  -F local_username=$LOCAL_USERNAME

# Watch the log
tail -f /var/log/thinx.log
