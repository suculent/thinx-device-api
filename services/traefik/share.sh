#!/bin/bash

# This scripts exports SSL certificates to other file-based services on same domain (MQTT, THiNX API)

# Production
#EXPORT_NAME="app.keyguru.eu"

# Staging
EXPORT_NAME="staging.thinx.cloud" # TODO: get from some ENV_VAR!!!


ACME=./acme.json
COUNT=$(jq '.Certificates | length' $ACME)

echo "Certificates found in ACME file: ${COUNT}"

COUNTER=0

while [[ $COUNTER -lt $COUNT ]]; do
  #echo The counter is $COUNTER
  DOMAIN=$(jq -r .Certificates[${COUNTER}].Domain.Main $ACME)
  CERT=$(jq -r .Certificates[${COUNTER}].Certificate $ACME)
  KEY=$(jq -r .Certificates[${COUNTER}].Key $ACME)

  if [[ "$DOMAIN" == "$EXPORT_NAME" ]]; then
    echo "Requested key found for domain: ${DOMAIN}"
    echo "Certificate: ${CERT}"
    echo "Key: ${KEY}"

    mkdir -p /mnt/data/ssl # TODO: get from some ENV_VAR!!!


    rm -rf /mnt/data/ssl/traefik_cert.pem
    echo $CERT | base64 --decode > /mnt/data/ssl/traefik_cert.pem

    rm -rf /mnt/data/ssl/traefik_key.pem
    echo $KEY | base64 --decode > /mnt/data/ssl/traefik_key.pem

    if [[ ! -f /mnt/data/mosquitto/ssl/traefik_cert.pem ]]; then
      ln -s /mnt/data/ssl/traefik_cert.pem /mnt/data/mosquitto/ssl/traefik_cert.pem
    fi

    if [[ ! -f /mnt/data/mosquitto/ssl/traefik_key.pem ]]; then
      ln -s /mnt/data/ssl/traefik_key.pem /mnt/data/mosquitto/ssl/traefik_key.pem
    fi

    exit 0
  fi
  ((COUNTER++))
done

exit 1
