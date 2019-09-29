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

#touch /mqtt/auth/thinx.pw && ls -la /mqtt/auth
echo "Mosquitto Entrypoint Credentials: ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}"

if [[ ! -z $MOSQUITTO_PASSWORD ]]; then
  if [[ ! -z $MOSQUITTO_USERNAME ]]; then
    mosquitto_passwd -b /mqtt/auth/thinx.pw ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}
  fi
fi

touch /mqtt/auth/thinx.acl

# Should be done by copying config, but what if the user gets changed?...

if [[ -z cat /mqtt/auth/thinx.acl | grep ${MOSQUITTO_USERNAME} ]]; then
    echo "Writing initial ACL record to auth/thinx.acl"
    echo "---------" >> /mqtt/auth/thinx.acl
    echo "user ${MOSQUITTO_USERNAME}" >> /mqtt/auth/thinx.acl
    echo "topic readwrite #" >> /mqtt/auth/thinx.acl
    echo " " >> /mqtt/auth/thinx.acl
else
    echo "Initial ACL record already exists in auth/thinx.acl"
fi

pkill apt # attempt to prevent sticking, suspicious thing it is.

# must run in background to prevent killing container on restart
mosquitto -d -v -c /mqtt/config/mosquitto.conf

ps -ax | grep mosquitto

tail -f /mqtt/log/mosquitto.log

sleep infinity
