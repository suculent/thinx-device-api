#!/bin/bash

# There is a commit-hook configured on GitHub. Repository gets pulled and app restarted on commit to 'master'

nohup githooked -p 9000 bash 'cd /root/thinx-device-api; git pull origin master --recurse-submodules; npm install .; bash ./tools/install-builders.sh; snyk protect; curl https://api.rollbar.com/api/1/deploy/ -F access_token=6aa9f20bef804b75a50338e03830919d -F environment=production -F revision=$(git log -n 1 --pretty=format:"%H") -F local_username=root; pm2 restart thinx' &
