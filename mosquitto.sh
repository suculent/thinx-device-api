#!/bin/bash

# Starts mosquitto with correct config (for THiNX in conf.d) as daemon

mosquitto -d -v -c /mnt/data/mosquitto/mosquitto.conf
