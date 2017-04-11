#!/bin/bash

# Get access cookie by authentication
curl -v -c cookies.jar \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "username" : "test", "password" : "tset" }' \
http://localhost:7442/api/login

curl -v -b cookies.jar \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "query" : false }' http://localhost:7442/api/view/devices
