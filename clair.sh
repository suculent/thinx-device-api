#!/bin/bash

# OK
./clair-scanner -c http://docker:6060 --ip 172.17.0.6 -r gl-container-scanning-report.json -l clair.log -w clair-whitelist.yml suculent/thinx-device-api
