#!/bin/bash

# There is a commit-hook configured on GitHub. Repository gets pulled and app restarted on commit to 'master'

nohup githooked -p 9000 bash "cd /root/thinx-device-api; git pull origin master --recurse-submodules; npm install .; bash ./tools/install-builders.sh; pm2 restart index" &
