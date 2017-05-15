#!/bin/bash

# Restarts the server using `forever` process manager

# Terminate all possible instances
set +e
service thinx stop
killall node
forever stopall
set -+

# Start the server in background
nohup forever -o /var/log/thinx.log index.js &

# Watch the log
tail -f /var/log/thinx.log
