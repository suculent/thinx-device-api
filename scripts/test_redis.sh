#!/bin/bash

# JPONG=$(curl -w '\n' http://thinx-redis:6379/ping)
export THINX_REDIS_IP=172.19.0.2

# ping a redis server at any cost
function redis-ping() {
  redis-cli -h $1 ping 2>/dev/null || \
  echo $((printf "PING\r\n";) | nc $1 6379 2>/dev/null || \
  exec 3<>/dev/tcp/$1/6379 && echo -e "PING\r\n" >&3 && head -c 7 <&3)
}

redis-ping $THINX_REDIS_IP
