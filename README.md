# ☢ thinx-device-api

IoT Device Management Server running on node.js.

[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=suculent_thinx-device-api&metric=vulnerabilities)](https://sonarcloud.io/dashboard?id=suculent_thinx-device-api)
[![Build Status](https://img.shields.io/circleci/project/github/suculent/thinx-device-api/master.svg)](https://circleci.com/gh/suculent/thinx-device-api)
[![CodeFactor](https://www.codefactor.io/repository/github/suculent/thinx-device-api/badge)](https://www.codefactor.io/repository/github/suculent/thinx-device-api)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=suculent_thinx-device-api&metric=security_rating)](https://sonarcloud.io/dashboard?id=suculent_thinx-device-api)
[![codebeat badge](https://codebeat.co/badges/a3b416b1-b53b-4bc5-ae6e-8a2b9ca31880)](https://codebeat.co/projects/github-com-suculent-thinx-device-api-master)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/suculent/thinx-device-api.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/suculent/thinx-device-api/context:javascript)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/9a7d084ad97e430ba12333f384b44255)](https://www.codacy.com/app/suculent/thinx-device-api?utm_source=github.com&utm_medium=referral&utm_content=suculent/thinx-device-api&utm_campaign=badger)
[![Total alerts](https://img.shields.io/lgtm/alerts/g/suculent/thinx-device-api.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/suculent/thinx-device-api/alerts/)
<a href="https://scan.coverity.com/projects/suculent-thinx-device-api">
  <img alt="Coverity Scan Build Status"
       src="https://scan.coverity.com/projects/18787/badge.svg"/>
</a>
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=suculent_thinx-device-api&metric=alert_status)](https://sonarcloud.io/dashboard?id=suculent_thinx-device-api)
[![Coverage Status](https://coveralls.io/repos/github/suculent/thinx-device-api/badge.svg?branch=master)](https://coveralls.io/github/suculent/thinx-device-api?branch=master)
[![License](https://img.shields.io/badge/license-ISC-green.svg?style=flat)](https://github.com/suculent/fastlane-plugin-apprepo/blob/master/LICENSE)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api?ref=badge_shield)
[![Greenkeeper badge](https://badges.greenkeeper.io/suculent/thinx-device-api.svg)](https://greenkeeper.io/)
[![Twitter: @thinxcloud](https://img.shields.io/badge/contact-%40thinxcloud-green.svg?style=flat)](https://twitter.com/thinxcloud)


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

* Supports OAuth login with [Google](https://www.google.com) and [GitHub](https://www.github.com).

* Supports InfluxDB/Grafana data storage and visualisation.

* Supports LoRaWan server integration.

* Supports [Rollbar](https://rollbar.com), [Sqreen](https://www.sqreen.com) and [Crisp.chat](https://crisp.chat) integrations.

* Message-queue integration using docker-compose `project` on `thinx_internal` network

* Supports [Traefik](https://traefik.io) for SSL offloading.


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

* API runs on HTTP port 7442 (HTTPS 7443) and 7444 (web socket)
* MQTTS runs on port 8883
* Admin runs on HTTP/HTTPS port (80/443)
* GitHub commit hooks are listened to on port 9002
* Status Transformers (internal network only, 7445)


## Logging

Use your favourite service and log-sender agent. Tested successfully with [Logz.io](https://logz.io), [Instana](https://www.instana.com) and [Sematext](https://sematext.com)

## Installation

### Prerequisites

**Suggested:**

* [Mailgun](https://mailgun.com) account (recently added)
* [Rollbar](https://rollbar.com) integration

**Optional:**

* [Google Analytics](https://analytics.google.com) integration
* [Sqreen](https://sqreen.com) integration
* [Slack](https://slack.com) integration
* [Crisp.chat](https://crisp.chat) integration

### Using docker-compose

Make sure you have valid directory structure available at `/mnt/data` (default) and edit the .env file to suit your needs.

You don't need Mailgun for developer installation, just copy-paste the activation URL from api log using `docker-compose logs -f` while creating your first admin account.

	git clone http://github.com/suculent/thinx-device-api
	cd thinx-device-api
	cp .env.dist .env
	cp .thinx_env.dist .thinx_env
	nano .env
	nano .thinx_env
	./copy-envs.sh
	docker-compose up -d --build

## GitHub Webhook support

You can direct your GitHub web-hooks to https://thinx.cloud:9001/ after adding a valid deploy key from GitHub to THiNX RTM.


## Endpoints

See 03-test.sh. There is no point of maintaining documentation for this at current stage of development and user base zero.


# Platforms State of Union

### Overall

Platform libraries are now stabilised on the basic level, approaching first release version 1.0 with default HTTPS with optional fallback to HTTP for development.

THiNX has now passed version 1.0 upgrading to docker-compose installation with separate container services (CouchDB, Redis, Transformers, THiNX, Traefik and optional monitoring services).

```
Data are being moved to configured location, which is by default /mnt/data:

deploy/ # build products ready for deployment to devices
mosquitto/ # auth, log, config, data, ...
repos/ # fetched/watched repositories
ssh_keys/ # will be moved to vault and provided exlusively to builder
ssl/ # shared SSL certificates, may be generated by Traefik/ACME/Letsencrypt
```

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


## License
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api?ref=badge_large)
