#!/bin/bash

set +e

touch /var/log/cron.log

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

pkill apt # attempt to prevent sticking, suspicious thing it is.

# must run in background to prevent killing container on restart
mosquitto -d -v -c /mqtt/config/mosquitto.conf

ps -ax | grep mosquitto

tail -f /mqtt/log/mosquitto.log

sleep infinity
