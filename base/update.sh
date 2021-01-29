#!/bin/bash

# expected usage:
# ./update.sh --owner suculent

OWNER="suculent"

docker build -t $OWNER/thinx-base-image .

docker push $OWNER/thinx-base-image:latest
