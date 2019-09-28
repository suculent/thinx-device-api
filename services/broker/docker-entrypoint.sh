#!/bin/bash

set +e

touch /var/log/cron.log

sysctl -w net.ipv4.tcp_keepalive_intvl=30
sysctl -w net.ipv4.tcp_keepalive_probes=8
sysctl -w net.ipv4.tcp_keepalive_time=120

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

touch /mqtt/auth/thinx.pw && ls -la /mqtt/auth
echo "MQTT Credentials: " ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}
mosquitto_passwd -b /mqtt/auth/thinx.pw ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}
touch /mqtt/auth/thinx.acl

# Should be done by copying config...
# echo "user ${MOSQUITTO_USERNAME}" >> /mqtt/auth/thinx.acl
# echo "topic readwrite #" >> /mqtt/auth/thinx.acl

pkill apt # attempt to prevent sticking, suspicious thing it is.

# must run in background to prevent killing container on restart
mosquitto -d -v -c /mqtt/config/mosquitto.conf

ps -ax | grep mosquitto

tail -f /mqtt/log/mosquitto.log

sleep infinity
