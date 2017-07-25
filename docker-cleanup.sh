#!/bin/bash

# Based on https://lebkowski.name/docker-volumes/

echo "Cleaning untagged Docker images..."

docker images --no-trunc | grep '<none>' | awk '{ print $3 }' \
    | xargs docker rmi

#

echo "Cleaning dead and exited containers..."

docker ps --filter status=dead --filter status=exited -aq \
  | xargs docker rm -v

#

echo "Removing unused volumes..."

docker volume ls -qf dangling=true | xargs docker volume rm
