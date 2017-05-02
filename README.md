# ☢ thinx-device-api

[![Coverage Status](https://coveralls.io/repos/github/suculent/thinx-firmware-esp8266/badge.svg?branch=master)](https://coveralls.io/github/suculent/thinx-firmware-esp8266?branch=master)

API Server running on node.js.

• Serves as an IoT device registration endpoint while storing device data using CouchDB server and Redis session-store.

• Application is a back-end data provider (security agent) for RTM admin console running on the same server (currently on Apache, but should converge to node.js).

• Provides control to a build server that pushes new firmware versions to client applications (FCM push) and devices (MQTT).

## Supported IoT Platforms

* ESP8266 (thinx-firmware-esp8266)
* Expected: Arduino

## Prerequisites

* Linux Server (possibly Raspberry Pi but not tested)
* API runs on HTTP port 7442 (possibly HTTPS 7441)
* Admin runs on HTTP/HTTPS port (80/443)

## Database Schema

* managed_devices: all devices
* managed_users: each user owns several api_keys and repositories that may be linked to one or more devices
* managed_logs: audit logs by owner
* managed_builds: unused, will store build logs, states and results. possibly pre & post-build tasks as builds will be organized by owner id/hash


## Endpoints (deprecated)

See code and tests. There is no point of maintaining documentation for this at current stage of development and user base zero.
