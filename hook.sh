#!/bin/bash

git pull origin master

pm2 restart index.js
