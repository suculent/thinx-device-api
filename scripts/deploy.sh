#!/bin/bash

echo "Running Rollbar Deploy..." \
    && source .env \
    && curl -s https://api.rollbar.com/api/1/deploy/ -F access_token=$ROLLBAR_TOKEN -F environment=production -F revision=$(git log -n 1 --pretty=format:\"%H\") -F local_username=$(whoami)
