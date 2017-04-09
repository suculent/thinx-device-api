#!/bin/bash

# May require additional authentication based on the CouchDB setup 
curl -X PUT http://localhost:5984/managed_devices/_design/devicelib -d @design/design_deviceslib.json
