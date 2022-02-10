#!/bin/bash

# This scripts exports SSL certificates to other file-based services on same domain (MQTT, THiNX API)

if [[ -z $(which jq) ]]; then
  echo "Installing missing dependency..."
  apt-get update && apt-get install -y jq
fi

for i in "$@"
do
case $i in
    -d=*|--domain=*)
    EXPORT_NAME="${i#*=}"
    shift # past argument=value
    ;;
    -o=*|--output=*)
    TARGET_FILE="${i#*=}"
    shift # past argument=value
    ;;
    *)
          # unknown option
    ;;
esac
done

if [[ -z ${EXPORT_NAME} ]]; then
  echo "Argument --domain= must contain domain to be exported."
  exit 1
fi

if [[ -z ${TARGET_FILE} ]]; then
  echo "Argument --output= must contain base filename to be exported."
  exit 1
fi

ACME=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json
COUNT=$(jq '.le.Certificates | length' $ACME)

echo "Certificates found in ACME file: ${COUNT}"

if [[ -z $COUNT ]]; then
  echo "No certificates found in:"
  jq . $ACME
  exit 0
fi

COUNTER=0

while [[ $COUNTER -lt $COUNT ]]; do

  DOMAIN=$(jq -r .le.Certificates[${COUNTER}].domain.main $ACME)
  CERT=$(jq -r .le.Certificates[${COUNTER}].certificate $ACME)
  KEY=$(jq -r .le.Certificates[${COUNTER}].key $ACME)

  echo "Domain: ${DOMAIN}"
  echo "Cert: ${DOMAIN}"
  echo "Key: ${DOMAIN}"

  if [[ "$DOMAIN" == "$EXPORT_NAME" ]]; then
    echo "Requested key found for domain: ${DOMAIN}"
    echo "Certificate: ${CERT}"
    echo "Key: ${KEY}"

    mkdir -p /mnt/data/ssl

    CERTFILE="${TARGET_FILE}_cert.pem"
    KEYFILE="${TARGET_FILE}_key.pem"

    if [ -f ${CERTFILE} ]; then
      rm ${CERTFILE}
    fi


    if [ -f ${KEYFILE} ]; then
      rm ${KEYFILE}
    fi

    echo $CERT | base64 --decode > ${CERTFILE}
    echo $KEY | base64 --decode > ${KEYFILE}

    echo "Certificate exported: ${CERTFILE}"
    echo "Private key exported: ${KEYFILE}"


    exit 0
  fi
  (( COUNTER++ ))
done

exit 1