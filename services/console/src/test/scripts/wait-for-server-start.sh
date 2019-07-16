#!/bin/bash

echo "Waiting for servers to start..."

curl -f http://localhost:80/

while true; do
  curl -f http://localhost:80/ > /dev/null 2> /dev/null
  if [ $? = 0 ]; then
    echo "Frontend started"

    curl -f http://rtm.thinx.cloud:80/ > /dev/null 2> /dev/null
    if [ $? = 0 ]; then
      echo "Backend started"
      break
    fi
  fi

  sleep 10
  echo -n .
done
