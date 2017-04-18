#!/bin/bash

# Get access cookie by authentication
curl -v -c cookies.jar \
-H "Origin: rtm.thinx.cloud" \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "username" : "test", "password" : "tset" }' \
http://$HOST:7442/api/login

curl -v -b cookies.jar \
-H 'Origin: rtm.thinx.cloud' \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X GET \
http://localhost:7442/api/user/apikey
