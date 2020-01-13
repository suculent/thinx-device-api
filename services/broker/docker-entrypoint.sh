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

touch /mqtt/log/mosquitto.log
chown -R mosquitto:mosquitto /mqtt

su mosquitto -s /bin/bash

touch /mqtt/log/mosquitto.log
touch /mqtt/auth/thinx.pw

if [[ ! -z $MOSQUITTO_PASSWORD ]]; then
  if [[ ! -z $MOSQUITTO_USERNAME ]]; then
    echo "Overwriting THiNX APP MQTT credentials in /mqtt/auth/thinx.pw"
    # /docker-entrypoint.sh: line 32: 16 Hangup
    nohup mosquitto_passwd -b /mqtt/auth/thinx.pw ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}
  else
    echo "MOSQUITTO_USERNAME for THiNX seems not to be set properly in .env "
  fi
else
  echo "MOSQUITTO_PASSWORD for THiNX seems not to be set properly in .env "
fi

CONFIG_FILE="/mqtt/config/mosquitto.conf"
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
  echo "Starting Mosquitto Daemon with configuration file ${CONFIG_FILE}"
  mosquitto -d -v -c ${CONFIG_FILE}
else
  echo "Starting Mosquitto Daemon without configuration file(!)"
  mosquitto -d -v
fi

tail -f /mqtt/log/mosquitto.log
sleep infinity
