#!/bin/bash

docker run -d \
  -p 3003:3003 \
  -p 3004:8083 \
  -p 8086:8086 \
  -v /root/docker-influxdb-grafana/influxdb:/var/lib/influxdb \
  -v /root/docker-influxdb-grafana/grafana:/var/lib/grafana \
  suculent/docker-influxdb-grafana:latest

docker run --user=transformer \
  -d -p 7475:7474 \
  -v /var/logs:/logs \
  -v /root/thinx-node-transformer:/app \
  suculent/thinx-node-transformer

pm2 start ecosystem.json
