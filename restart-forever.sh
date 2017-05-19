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

# Watch the log
tail -f /var/log/thinx.log
