#!/bin/bash

# deprecated, managed by docker-compose orchestration
# nohup githooked --ref "refs/heads/staging" -p 9000 bash "cd /var/www/rtm/www; git pull origin current && cd /root/thinx-device-api; git pull origin master --recurse-submodules; bash ./tools/install-builders.sh; npm install .; snyk protect; curl https://api.rollbar.com/api/1/deploy/ -F access_token=$ROLLBAR_ACCESS_TOKEN -F environment=production -F revision=$(git log -n 1 --pretty=format:\"%H\") -F local_username=$(whoami); pm2 restart ecosystem.json" &
