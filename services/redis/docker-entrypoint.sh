#!/bin/bash

set -e

echo "Starting Redis with password in entrypoint ${REDIS_PASSWORD}"

redis-server --port 6379 --requirepass ${REDIS_PASSWORD}

redis-cli -a ${REDIS_PASSWORD} BGSAVE
