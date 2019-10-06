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
echo "Contents of /mqtt/config:"
ls -la /mqtt/config
echo ""

CONFIG_FILE="/mqtt/config/mosquitto.conf"

echo "Contents of ${CONFIG_FILE}"
cat ${CONFIG_FILE}
echo ""

ACL_FILE="/mqtt/auth/thinx.acl"
touch $ACL_FILE

IS_REGISTERED=$(grep ${MOSQUITTO_USERNAME} ${ACL_FILE})

if [[ -z $IS_REGISTERED ]]; then
    echo "Writing initial ACL record to ${ACL_FILE}..."
    echo "user ${MOSQUITTO_USERNAME}" >> ${ACL_FILE}
    echo 'topic readwrite #' >> ${ACL_FILE}
    echo " " >> ${ACL_FILE}
    cat ${ACL_FILE}
else
    echo "Initial ACL record already exists in ${ACL_FILE}"
fi

pkill apt # attempt to prevent sticking, suspicious thing it is.

# must run in background to prevent killing container on restart
# must be external file to allow SSL certificate changes
if [[ -f ${CONFIG_FILE} ]]; then
  echo "Starting with configuration file ${CONFIG_FILE}"
  mosquitto -d -v -c ${CONFIG_FILE}
else
  echo "Starting without configuration file(!)"
  mosquitto -d -v
fi

ps -ax | grep mosquitto

tail -f /mqtt/log/mosquitto.log

sleep infinity
