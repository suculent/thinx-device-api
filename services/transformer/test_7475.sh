#!/bin/bash

curl -vvv -XPOST \
-H "Content-Type: application/json" \
-d '{ "jobs": [ { "id": "transaction-identifier", "owner": "owner-id", "codename": "status-transformer-alias", "code": "function transformer(status, device) { return status; };", "params": { "status": "Battery 100.0V", "device": { "owner": "owner-id", "id": "device-id" } } } ] }' \
http://localhost:7475/do
