# ☢ thinx-device-api

IoT Device Management Server running on node.js.

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/9a7d084ad97e430ba12333f384b44255)](https://www.codacy.com/app/suculent/thinx-device-api?utm_source=github.com&utm_medium=referral&utm_content=suculent/thinx-device-api&utm_campaign=badger)
[![Twitter: @thinxcloud](https://img.shields.io/badge/contact-%40thinxcloud-green.svg?style=flat)](https://twitter.com/thinxcloud)
[![License](https://img.shields.io/badge/license-ISC-green.svg?style=flat)](https://github.com/suculent/fastlane-plugin-apprepo/blob/master/LICENSE)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api?ref=badge_shield)
[![Build Status](https://img.shields.io/circleci/project/github/suculent/thinx-device-api/master.svg)](https://circleci.com/gh/suculent/thinx-device-api)
[![Coverage Status](https://coveralls.io/repos/github/suculent/thinx-device-api/badge.svg?branch=master)](https://coveralls.io/github/suculent/thinx-device-api?branch=master)
[![Greenkeeper badge](https://badges.greenkeeper.io/suculent/thinx-device-api.svg)](https://greenkeeper.io/)

The CircleCI build is limited and therefore returns mostly bad results. Closer look may show better numbers.


## The Purpose


* Update IoT device by pushing a code to a Git repository. We'll build it.
* Swap operating system for another over-the-air.
* Migrate multiple devices at once between WiFi networks.
* THiNX provides complete IoT infrastructure for your device (where the data storage and visualisation can be fully up to you).
* automatic updates for headless devices, or semi-automatic (with user consent after build and tests succeed)

> As a user I have already many IoT new and/or legacy devices at home and new platforms are coming every day.

> Sometimes we need to change WiFi credentials on a wireless switch mounted on a ceiling. The other day I we want to swap whole firmware for new one, but not always to rewrite working legacy Lua or Micropython code to PlatformIO.

That's why we have decided to create the über-platform: THiNX.

## Supported hardware

Currently the platform supports building firmware for Arduino, PlatformIO (also with ESP-IDF), NodeMCU, Mongoose, Micropython and features JavaScript library that is intended to use on any hardware capable of running a Node.js server.

## Features

* Remote Things Management console for monitoring devices, attaching source code, pushing data, managing incoming payloads and firmware updates.

* Continuous Integration practices to update device apps/configurations from a GitHub repository using commit hooks

* Building secure MQTTS infrastructure as an optional side-chain transport layer.

* Device registration endpoint while storing device data using CouchDB server and Redis session-store.

* API is a back-end data provider (security agent) for RTM Admin Console Application.

* Provides control to a dockerized build servers and pushes new firmware versions to client applications (FCM push) and devices (MQTT).

* Provides HTTP-to-HTTPS proxy to secure legacy IoT devices that are not capable of TLS and/or AES-level encryption.

* Allows transfer of device ownership (e.g. for pre-configured devices).

* Custom firmware builder for MongooseOS, NodeMCU and Micropython (allow module selection, add THiNX as an OS-level library)

* Transfer device to another owner along with sources/firmware.

* Device status messages can be transformed using custom JavaScript lambda-style functions.

* Supports OAuth login with Google and GitHub.

* Supports InfluxDB/Grafana data storage and visualisation.

* Supports LoRaWan server integration.


## Supported IoT Platforms

* PlatformIO and Arduino IDE (ESP8266P/ESP32)
* Micropython
* Lua
* MongooseOS
* NodeJS (Mac/Linux/Windows)

* Tested on Wemos D1 Mini, Wemos D1 Mini Pro, RobotDyn D1, RobotDyn D1 Mini, RobotDyn MEGA WiFi and various NodeMCU (Lolin, AI-THINKER) boards with Mongoose, Arduino Core, ESP-IDF, Lua and Micropython-based core firmwares...

* Expected: Arduino and BigClown with networking support

Base THiNXLib Platform Library in C++:

[THiNXLib for ESP8266](https://github.com/suculent/thinx-lib-esp8266)

[THiNXLib for ESP32](https://github.com/suculent/thinx-lib-esp32)

THiNX Platform Library repositories for various IDEs and firmwares:

[Platform.io](https://github.com/suculent/thinx-firmware-esp8266-pio)

[Arduino](https://github.com/suculent/thinx-firmware-esp8266-ino)

[NodeMCU/Lua](https://github.com/suculent/thinx-firmware-esp8266-lua)

[Micropython](https://github.com/suculent/thinx-firmware-esp8266-upy)

[MongooseOS](https://github.com/suculent/thinx-firmware-esp8266-mos)

[NodeJS](https://github.com/suculent/thinx-firmware-js)


## Custom Firmwares

With built-in THiNX Client Library:

[NodeMCU/Lua](https://github.com/suculent/nodemcu-firmware)

[Micropython](https://github.com/suculent/nodemcu-micropython)

Arduino, Plaform.io and MongooseOS are firmwares by nature.


## Dockerized Firmware Builders

[PlatformIO](https://github.com/suculent/platformio-docker-build)

[Arduino](https://github.com/suculent/arduino-docker-build)

[MongooseOS](https://github.com/suculent/mongoose-docker-build)

[NodeMCU/Lua](https://github.com/suculent/nodemcu-docker-build/)

[Micropython](https://github.com/suculent/micropython-docker-build/)


## Prerequisites for running own THiNX Server

* Linux Server (min. 2 GB RAM, 32GB SSD, Ubuntu)
* Docker

## Port mapping

* API runs on HTTP port 7442 (HTTPS 7443) and 7447 (web socket)
* MQTTS runs on port 8883
* Admin runs on HTTP/HTTPS port (80/443)
* GitHub commit hooks are listened to on port 9000, 9001
* Grafana (3003), InfluxDB (3004)
* Status Transformers (localhost only, 7445)
* Optional monitoring services (Keymetrics, TrueSight) may run on other ports as well...

## Installation

### Prerequisites

**Required:**

* Mailgun account (recently added)

**Optional:**

* Google Analytics integration
* Rollbar integration
* Sqreen integration
* Slack integration

### Using Docker

Experimental Docker installation can be found at [Docker Hub](https://hub.docker.com/r/suculent/thinx-docker/).

First of all, set a valid FQDN (THINX_HOSTNAME) for your new THiNX instance on your DNS server. Use this FQDN to parametrise the Docker image by following example:

    docker pull suculent/thinx-docker

    docker build --build-arg THINX_HOSTNAME=staging.thinx.cloud -t suculent/thinx-docker .

    docker run -ti -e THINX_HOSTNAME='staging.thinx.cloud' -e THINX_OWNER='suculent@me.com' suculent/thinx-docker

### Installing Platform Builders

Attach to the running container with bash:

```
docker run -ti -e THINX_HOSTNAME='staging.thinx.cloud' -e THINX_OWNER='suculent@me.com' suculent/thinx-docker /bin/bash

```

Fetch required builder images from Docker Hub:

```
bash ./install-builders.sh
```

### Run after boot

We're currently using /etc/rc.local to kick THiNX up after a failure:

```

# MQTT service
mosquitto > /root/thinx-device-api/mosquitto.log &

# Redis service
redis-server > /root/thinx-device-api/redis.log &

# CouchDB service
/etc/init.d/couchdb start

# NodeJS Sandbox
docker run --rm -d suculent/thinx-node-tranformer

# Grafana/InfluxDB
docker run -d \
  -p 3003:3003 \
  -p 3004:8083 \
  -p 8086:8086 \
  -v /root/docker-influxdb-grafana/influxdb:/var/lib/influxdb \
  -v /root/docker-influxdb-grafana/grafana:/var/lib/grafana \
  suculent/docker-influxdb-grafana:latest

# THiNX itself
cd /root/thinx-device-api/ && pm2 start index

```

## GitHub Webhook support

You can direct your GitHub web-hooks to https://thinx.cloud:9001/ after adding a valid deploy key from GitHub to THiNX RTM.


## Endpoints

See 03-test.sh. There is no point of maintaining documentation for this at current stage of development and user base zero.


# Platforms State of Union

### Overall

Platform libraries are now stabilised on the basic level, approaching first release version 1.0 with default HTTPS with optional fallback to HTTP for development.

### PlatformIO

* Docker builder works.
* Deployment update can be tested now.

### Arduino

* Docker builder has been recently updated.
* Deployment update can be tested now.

### NodeMCU

* File-based update has been pre-tested. Docker builder works fine but needs tighter integration with sources (`$workdir`).
* Deployment is not verified, therefore update cannot be tested.

### Micropython

* Docker builder works fine but needs tighter integration with sources.
* Deployment is not verified, therefore update cannot be tested now.

# Roadmap

## On-Horizon

* PlatformIO: end-to-end update
* Arduino: end-to-end update


## License
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api?ref=badge_large)
