# ☢ thinx-device-api

[![Twitter: @igraczech](https://img.shields.io/badge/contact-%40igraczech-green.svg?style=flat)](https://twitter.com/igraczech)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat)](https://github.com/suculent/fastlane-plugin-apprepo/blob/master/LICENSE)
[![Build Status](https://img.shields.io/circleci/project/github/suculent/thinx-device-api/master.svg)](https://circleci.com/gh/suculent/thinx-device-api)
[![Coverage Status](https://coveralls.io/repos/github/suculent/thinx-device-api/badge.svg?branch=master)](https://coveralls.io/github/suculent/thinx-device-api?branch=master)

IoT Device Management Server running on node.js.

## The Purpose

As a user I have already many IoT new and/or legacy devices at home. Sometimes I need to change WiFi credentials on a switch that is mounted on a ceiling. Sometimes I want to swap whole firmware for new one, but not always I want to rewrite working legacy LUA code to Arduino C. That's why we have decided to create THiNX.

> Update your IoT device by pushing to a git repository. Swap your operating system for another over-the-air. Migrate multiple devices at once between WiFi networks.

* Implements Continuous Integration practices to update device apps/configurations from a GitHub repository using commit hooks.

* Helps building secure MQTT infrastructure as an optional side-chain transport layer.

* Serves as an IoT device registration endpoint while storing device data using CouchDB server and Redis session-store.

* API is a back-end data provider (security agent) for RTM Admin Console Application.

* Provides control to a build server that pushes new firmware versions to client applications (FCM push) and devices (MQTT).

* Provides HTTP-to-HTTPS proxy to secure legacy IoT devices that are not capable of TLS and/or AES-level encryption.

* Allows transfer of device ownership (e.g. for pre-configured devices).

## Future roadmap

* Custom firmware builder for MongooseOS, NodeMCU and Micropython (allow module selection, add THiNX as an OS-level library)

* Transfer device to another owner along with sources/firmware.

## Supported IoT Platforms

* ESP8266 (thinx-firmware-esp8266)
* Tested on Wemos D1 Mini, Wemos D1 Mini Pro, Robodyn D1, Robodyn D1 Mini and NodeMCU with Arduino, LUA and Micropython-based core firmwares
* Expected: Any Arduino with networking support, MongooseOS

THiNX platform agent repositories:

[Platform.io](https://github.com/suculent/thinx-firmware-esp8266-pio)
[Arduino](https://github.com/suculent/thinx-firmware-esp8266-ino)
[NodeMCU LUA](https://github.com/suculent/thinx-firmware-esp8266-lua)
[Micropython](https://github.com/suculent/thinx-firmware-esp8266-upy)
[MongooseOS](https://github.com/suculent/thinx-firmware-esp8266-mos)

## Prerequisites

* Linux Server (min. 2 GB RAM)
* API runs on HTTP port 7442 (possibly HTTPS 7443) and 7447 (websocket)
* MQTT runs on HTTP port 1883 (possibly HTTPS 8883)
* Admin runs on HTTP/HTTPS port (80/443)
* GitHub commit hooks are listened to on port 9001

## Installation

Ree RTM.md for all details.

### GitHub Webhook support

You can direct your GitHub webhooks to http://thinx.cloud:9001/ after adding a valid deploy key from GitHub to THiNX RTM.

## Endpoints

See 03-test.sh. There is no point of maintaining documentation for this at current stage of development and user base zero.
