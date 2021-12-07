#!/bin/bash

set -e

redis-server --port 6379 --requirepass ${REDIS_PASSWORD}

# no need anymore, will be trigered by app:
redis-cli -a ${REDIS_PASSWORD} BGSAVE
