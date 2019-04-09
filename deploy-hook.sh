#!/bin/bash

# There is a commit-hook configured on GitHub. Repository gets pulled and app restarted on commit to 'master'
# npm install can be temporarily removed as it takes too long...

nohup githooked -p 9000 bash "cd /var/www/rtm/www; git pull origin current && cd /root/thinx-device-api; git pull origin master --recurse-submodules; bash ./tools/install-builders.sh; npm install .; snyk protect; curl https://api.rollbar.com/api/1/deploy/ -F access_token=6aa9f20bef804b75a50338e03830919d -F environment=production -F revision=$(git log -n 1 --pretty=format:\"%H\") -F local_username=$(whoami); pm2 restart ecosystem.json" &
