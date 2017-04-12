#!/bin/bash

#
# Install and check with eslint
#

# make sure this will run on CI

if [[ $(which eslint | wc -l) == 0 ]]; then
  echo "» Installing eslint..."
  npm install -g eslint
else
  echo "» eslint found, no need to install."
fi

# init should be already done and available in repo

echo "» slintám..."

eslint **/*.js
eslint *.js

echo

if [[ ! -f $(which srcclr) ]]; then
  echo "» [:] SourceClear not found, installing..."
  curl -sSL https://srcclr.com/install | bash
fi

#
# [:] SourceClear
#

# should be handled by circle ci like this:
#test:
#  post:
#    - curl -sSL https://download.sourceclear.com/ci.sh | sh
# + requires added SRCCLR_API_TOKEN to Circle CI

if [[ $(which srcclr) ]]; then
  echo "Would 'srcclr scan .' but circle should do that"
  srcclr .
fi
