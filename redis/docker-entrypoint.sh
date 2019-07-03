#!/bin/bash

set -e

source /redis-password

redis-server --port 6379 --requirepass $REDIS_PASSWORD

redis-cli -a $REDIS_PASSWORD BGSAVE

