#!/bin/bash

# expected usage:
# ./update.sh --owner suculent

export OWNER="thinxcloud"

docker build -t $OWNER/base .

docker push $OWNER/base
