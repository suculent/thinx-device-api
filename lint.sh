#!/bin/bash

# make sure this will run on CI

npm install -g eslint

# init should be already done and available in repo

eslint **/*.js
