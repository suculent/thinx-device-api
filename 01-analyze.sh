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
