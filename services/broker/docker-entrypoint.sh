#!/bin/bash

set +e

#touch /var/log/cron.log

#sysctl -w net.ipv4.tcp_keepalive_intvl=30
#sysctl -w net.ipv4.tcp_keepalive_probes=8
#sysctl -w net.ipv4.tcp_keepalive_time=120

cron -f &

# must be run as root
incrond --foreground &
incrontab --reload
incrontab -l

echo "Switching to service user..."
touch /mqtt/log/mosquitto.log
chown -R mosquitto:mosquitto /mqtt

su mosquitto -s /bin/bash

echo "Mosquitto Entrypoint Credentials: ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}"

touch /mqtt/auth/thinx.pw

if [[ ! -z $MOSQUITTO_PASSWORD ]]; then
  if [[ ! -z $MOSQUITTO_USERNAME ]]; then
    echo "Overwriting THiNX APP MQTT credentials in /mqtt/auth/thinx.pw"
    mosquitto_passwd -b /mqtt/auth/thinx.pw ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}
  fi
fi

echo ""
echo "Password file contents:"
cat /mqtt/auth/thinx.pw
echo "<<<"

echo ""
echo "Config file & contents of /mqtt/config:"
ls -la /mqtt/config
cat /mqtt/config/mosquitto.conf
echo "<<<"

touch /mqtt/auth/thinx.acl

# Should be done by copying config, but what if the user gets changed?...

IS_REGISTERED=`$(grep ${MOSQUITTO_USERNAME} "/mqtt/auth/thinx.acl")`

if [ -z $IS_REGISTERED ]; then
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
# must be external file to allow SSL certificate changes
if [[ -f /mqtt/config/mosquitto.conf ]]; then
  echo "Starting with configuration file /mqtt/config/mosquitto.conf"
  mosquitto -d -v -c /mqtt/config/mosquitto.conf
else
  echo "Starting without configuration file(!)"
  mosquitto -d -v
fi

ps -ax | grep mosquitto

tail -f /mqtt/log/mosquitto.log

sleep infinity
