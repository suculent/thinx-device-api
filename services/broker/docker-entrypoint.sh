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

sleep 1

ps -ax | grep mosquitto

# Run forever so the container does not die...
tail -f /dev/null
