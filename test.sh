#!/bin/bash

curl -H "Content-Type: application/json" -H "User-Agent: THiNX-Client" \
-X POST -d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "registration-token-optional", "alias" : "test", "owner": "admin" } }' \
http://localhost:7442/api/login

