#!/bin/bash

# May require additional authentication based on the CouchDB setup
curl -X PUT http://localhost:5984/managed_devices/_design/devicelib -d @design/design_deviceslib.json
curl -X PUT http://localhost:5984/managed_users/_design/users -d @design/design_users.json
curl -X PUT http://localhost:5984/managed_repos/_design/repos -d @design/design_repos.json
curl -X PUT http://localhost:5984/managed_builds/_design/builds -d @design/design_builds.json
