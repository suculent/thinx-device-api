#!/bin/bash

# Starts mosquitto with correct config (for THiNX in conf.d) as daemon

mosquitto -d -v -c /root/thinx/data/mosquitto/mosquitto.conf
