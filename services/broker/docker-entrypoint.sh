#!/bin/bash

set +e

echo "Starting cron..."

cron -f &

echo "Starting incron..."

# must be run as root
incrond --foreground &
incrontab --reload
incrontab -l

echo "Switching to service user..."
touch /mqtt/log/mosquitto.log
chown -R mosquitto:mosquitto /mqtt

su mosquitto -s /bin/bash

echo "Starting MQTT broker..."

mosquitto -d -v -c /mqtt/config/mosquitto.conf

ps -ax | grep mosquitto

pkill apt # attempt to prevent sticking, suspicious thing it is.

# Run forever so the container does not die...
sleep infinity
