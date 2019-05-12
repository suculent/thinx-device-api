#!/bin/bash

# Starts mosquitto with correct config (for THiNX in conf.d) as daemon

mosquitto -d -c /mnt/data/mosquitto/mosquitto.conf
