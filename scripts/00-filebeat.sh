#!/bin/bash

# This script should be started after reboot along with rest of THiNX.
# Optionally logs to Logz.io

filebeat -c /root/thinx-device-api/install/filebeat.yml &
