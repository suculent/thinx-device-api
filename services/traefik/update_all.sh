#!/bin/sh

# This is example on how the SSL certificates in THiNX are managed:
#
# 1. Traefik needs to be restarted at least every 3 months to regenerate SSL certificate
# 2. When the certificate is regenerated (into acme.json), needs to be exported to `/mnt/../ssl`
# 3. Exported certificates can be used separately for Registry, Web/API HTTPS and MQTTS

./update.sh --domain=registry.example.com --output=registry
./update.sh --domain=api.example.com --output=traefik
