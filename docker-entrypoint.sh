#!/bin/bash

set -e

# exec "$@"

# TODO: send deploy notice to Rollbar if token set...

pwd
ls

source ~/.profile

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

/root/.nvm/versions/node/v11.13.0/bin/pm2 start ecosystem.json

#echo "Trying again with bash..."
#bash -c "pm2 start ecosystem.json"

pm2 logs -f

# sort of works but without pm2
# node thinx.js

# fails for unknown path to pm2
#pm2 start ecosystem.json


