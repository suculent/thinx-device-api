# ☢ thinx-device-api

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/9a7d084ad97e430ba12333f384b44255)](https://www.codacy.com/app/suculent/thinx-device-api?utm_source=github.com&utm_medium=referral&utm_content=suculent/thinx-device-api&utm_campaign=badger)
[![Twitter: @thinxcloud](https://img.shields.io/badge/contact-%40thinxcloud-green.svg?style=flat)](https://twitter.com/thinxcloud)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat)](https://github.com/suculent/fastlane-plugin-apprepo/blob/master/LICENSE)
[![Build Status](https://img.shields.io/circleci/project/github/suculent/thinx-device-api/master.svg)](https://circleci.com/gh/suculent/thinx-device-api)
[![Coverage Status](https://coveralls.io/repos/github/suculent/thinx-device-api/badge.svg?branch=master)](https://coveralls.io/github/suculent/thinx-device-api?branch=master)

IoT Device Management Server running on node.js.


## The Purpose

> Update IoT device by pushing to a Git repository. Swap operating system for another over-the-air. Migrate multiple devices at once between WiFi networks.

As a user I have already many IoT new and/or legacy devices at home and new platforms are coming every day.

Sometimes we need to change WiFi credentials on a wireless switch mounted on a ceiling. The other day I we want to swap whole firmware for new one, but not always to rewrite working legacy Lua or Micropython code to PlatformIO.

It also covers other use-cases like remotely managing devices for customers with automatic updates for headless devices, or semi-automatic (with user consent after build and tests succeeded).

> That's why we have decided to create the über-platform: THiNX.

Currently we're capable of building firmwares for PlatformIO, NodeMCU and Micropython (and simple Arduino firmware is also coming soon)

* Remote Things Management console for monitoring devices, attaching source code, pushing data, managing incoming payloads and firmware updates.

* Implements Continuous Integration practices to update device apps/configurations from a GitHub repository using commit hooks.

* Helps building secure MQTT infrastructure as an optional side-chain transport layer.

* Serves as an IoT device registration endpoint while storing device data using CouchDB server and Redis session-store.

* API is a back-end data provider (security agent) for RTM Admin Console Application.

* Provides control to a dockerized build servers and pushes new firmware versions to client applications (FCM push) and devices (MQTT).

* Provides HTTP-to-HTTPS proxy to secure legacy IoT devices that are not capable of TLS and/or AES-level encryption.

* Allows transfer of device ownership (e.g. for pre-configured devices).

* Custom firmware builder for MongooseOS, NodeMCU and Micropython (allow module selection, add THiNX as an OS-level library)

* Transfer device to another owner along with sources/firmware.

* Device status messages can be transformed using custom JavaScript lambda-style functions.

* Supports OAuth login with Google and GitHub.


## Supported IoT Platforms

* ESP8266 (thinx-firmware-esp8266-arduino) for PlatformIO and Arduino IDE

* Tested on Wemos D1 Mini, Wemos D1 Mini Pro, RobotDyn D1, RobotDyn D1 Mini, RobotDyn MEGA WiFi and various NodeMCU (Lolin, AI-THINKER) boards with Arduino, Lua and Micropython-based core firmwares...

* Expected: Arduino with networking support, MongooseOS-based devices...

THiNX Platform Library repository:

[thinx-firmware-esp8266-arduino](https://github.com/suculent/thinx-firmware-esp8266-arduino)

THiNX Platform Library Sample repositories:

[Platform.io](https://github.com/suculent/thinx-firmware-esp8266-pio)

[Arduino](https://github.com/suculent/thinx-firmware-esp8266-ino)

[NodeMCU/Lua](https://github.com/suculent/thinx-firmware-esp8266-lua)

[Micropython](https://github.com/suculent/thinx-firmware-esp8266-upy)

[MongooseOS](https://github.com/suculent/thinx-firmware-esp8266-mos)


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


## Prerequisites

* Linux Server (min. 2 GB RAM, 32GB SSD)
* Docker

## Port mapping

* API runs on HTTP port 7442 (possibly HTTPS 7443) and 7447 (web socket)
* MQTT runs on HTTP port 1883 (possibly HTTPS 8883)
* Admin runs on HTTP/HTTPS port (80/443)
* GitHub commit hooks are listened to on port 9000, 9001
* Optional monitoring services (Keymetrics, TrueSight) may run on other ports as well...

## Installation

### Using Docker

Experimental Docker installation can be found at [Docker Hub](https://hub.docker.com/r/suculent/thinx-docker/).

First of all, set a valid FQDN for your new THiNX instance on your DNS server. Use this FQDN to parametrise the Docker image:

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


## GitHub Webhook support

You can direct your GitHub web-hooks to https://thinx.cloud:9001/ after adding a valid deploy key from GitHub to THiNX RTM.


## Endpoints

See 03-test.sh. There is no point of maintaining documentation for this at current stage of development and user base zero.


# Platforms State of Union

### Overall

Platform libraries are now stabilised on the basic level, approaching first release version 1.0.

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
* Status Transformers: server-side lambda functions

## Platform support

* ESP32 (WiFi Manager is already available!)

## Near Future

* ACL implementation for MQTT is next in the queue.
* Arduino/PlatformIO: end-to-end MQTT

## Vote for it...

* Lua: build, file update
* UPY: build, file update
* MOS: build, file update; firmware update; library
