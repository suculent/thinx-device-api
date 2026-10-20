# ☢ thinx-device-api

THiNX is a self-hosted IoT device management server. You push code to a Git repository, THiNX builds firmware for your
devices in Docker, and the devices update themselves over the air. This repository is the API server (Node.js) that
ties it together: device registration, builds, MQTT messaging, and the back end for the web console.

[![CircleCI](https://circleci.com/gh/suculent/thinx-device-api.svg?style=svg)](https://circleci.com/gh/suculent/thinx-device-api/tree/main)
[![Coverage Status](https://coveralls.io/repos/github/suculent/thinx-device-api/badge.svg?branch=thinx-staging)](https://coveralls.io/github/suculent/thinx-device-api?branch=thinx-staging)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/9a7d084ad97e430ba12333f384b44255)](https://www.codacy.com/app/suculent/thinx-device-api?utm_source=github.com&utm_medium=referral&utm_content=suculent/thinx-device-api&utm_campaign=badger)
[![CodeFactor](https://www.codefactor.io/repository/github/suculent/thinx-device-api/badge)](https://www.codefactor.io/repository/github/suculent/thinx-device-api)
[![License: ISC](https://img.shields.io/badge/license-ISC-green.svg?style=flat)](./LICENSE)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api?ref=badge_shield)
[![Twitter: @thinxcloud](https://img.shields.io/badge/contact-%40thinxcloud-green.svg?style=flat)](https://twitter.com/thinxcloud)

## Why THiNX

Most of us already have a drawer full of IoT devices: some new, some legacy, all on different platforms. Changing the
WiFi password on a switch mounted to the ceiling shouldn't mean climbing a ladder. Swapping a device's firmware
shouldn't force you to rewrite working Lua or MicroPython code in PlatformIO either.

THiNX handles that:

* Push to Git and THiNX builds and delivers new firmware. Updates can be automatic, or wait for your approval once the build and tests pass.
* Change per-device settings remotely and securely, including moving many devices to a new WiFi network at once.
* Swap one firmware platform for another over the air.
* Keep your own data storage and visualisation. THiNX manages the devices, not your data.

## What's in the box

* A management console for monitoring devices, attaching source repositories, sending data, and managing payloads and firmware updates. It has OAuth login with Google and GitHub.
* Device registration, with device data in CouchDB and sessions in Redis.
* Firmware builds in Docker containers or Docker Swarm services, with controllable parallelism. One worker per node is a good default; Swarm spreads the load.
* GitHub webhooks: a commit can trigger a build and an update.
* Mosquitto MQTT (plain and TLS) with the go-auth plugin, sized from a handful of devices to thousands. The auth back end can be shared between instances (production, staging, test).
* An HTTP port for legacy devices that can't do TLS, next to HTTPS.
* Environment variables per device, editable through the API or an API key. Changing them triggers a firmware update even when the code version stays the same, which is how WiFi credentials get rotated.
* Device ownership transfer, with sources and firmware.
* Status transformers: small JavaScript functions that rewrite device status messages.
* Integrations: Traefik (TLS termination), Rollbar, Crisp.chat, Mailgun, Slack, LoRaWAN server, FCM push.

## Supported platforms

THiNX builds firmware for Arduino and PlatformIO (ESP8266, ESP32, also with ESP-IDF), NodeMCU (Lua), MongooseOS and
MicroPython, and ships a JavaScript client for anything that runs Node.js.

It has been tested on Wemos D1 Mini and D1 Mini Pro, RobotDyn D1, D1 Mini and MEGA WiFi, and several NodeMCU boards (Lolin,
AI-Thinker), with Mongoose, Arduino Core, ESP-IDF, Lua and MicroPython firmware.

### Client libraries

| Platform | Repository |
|----------|------------|
| ESP8266 (C++ base library) | [thinx-lib-esp8266](https://github.com/suculent/thinx-lib-esp8266) |
| ESP32 (C++ base library) | [thinx-lib-esp32](https://github.com/suculent/thinx-lib-esp32) |
| PlatformIO | [thinx-firmware-esp8266-pio](https://github.com/suculent/thinx-firmware-esp8266-pio) |
| Arduino | [thinx-firmware-esp8266-ino](https://github.com/suculent/thinx-firmware-esp8266-ino) |
| NodeMCU/Lua | [thinx-firmware-esp8266-lua](https://github.com/suculent/thinx-firmware-esp8266-lua) |
| MicroPython | [thinx-firmware-esp8266-upy](https://github.com/suculent/thinx-firmware-esp8266-upy) |
| MongooseOS | [thinx-firmware-esp8266-mos](https://github.com/suculent/thinx-firmware-esp8266-mos) |
| Node.js | [thinx-firmware-js](https://github.com/suculent/thinx-firmware-js) |
| MCP device (Node.js) | [thinx-mcp-device](https://github.com/suculent/thinx-mcp-device): a THiNX device client that runs as an MCP stdio server. It registers, listens on MQTT and downloads (never flashes) OTT firmware updates, and can report itself as an Arduino or PlatformIO device. |

Firmware with the THiNX client built in: [NodeMCU/Lua](https://github.com/suculent/nodemcu-firmware) and
[MicroPython](https://github.com/suculent/nodemcu-micropython). Arduino, PlatformIO and MongooseOS projects are
firmware already, so they just include the library.

### Firmware builders

Each builder is a Docker image that the worker runs per build:

| Builder | CI |
|---------|----|
| [platformio-docker-build](https://github.com/suculent/platformio-docker-build) | [![CircleCI](https://circleci.com/gh/suculent/platformio-docker-build.svg?style=shield)](https://circleci.com/gh/suculent/platformio-docker-build) |
| [arduino-docker-build](https://github.com/suculent/arduino-docker-build) | [![CircleCI](https://circleci.com/gh/suculent/arduino-docker-build/tree/master.svg?style=shield)](https://circleci.com/gh/suculent/arduino-docker-build/tree/master) |
| [mongoose-docker-build](https://github.com/suculent/mongoose-docker-build) | [![CircleCI](https://circleci.com/gh/suculent/mongoose-docker-build.svg?style=shield)](https://circleci.com/gh/suculent/mongoose-docker-build) |
| [nodemcu-docker-build](https://github.com/suculent/nodemcu-docker-build/) | [![CircleCI](https://circleci.com/gh/suculent/nodemcu-docker-build.svg?style=shield)](https://circleci.com/gh/suculent/nodemcu-docker-build) |
| [micropython-docker-build](https://github.com/suculent/micropython-docker-build/) | [![CircleCI](https://circleci.com/gh/suculent/micropython-docker-build.svg?style=shield)](https://circleci.com/gh/suculent/micropython-docker-build) |

## Running your own THiNX

### What you need

* A Linux server (Ubuntu works) with at least 2 GB RAM and 32 GB SSD.
* Docker. Docker Compose is the quick start; Docker Swarm is for scaling out.
* Two DNS names, for example `api.yourdomain.com` (API) and `console.yourdomain.com` (console). For a localhost test,
  set `debug: { allow_http_login: true }` in `conf/config.json` instead.
* Recommended: a [Mailgun](https://mailgun.com) account for account e-mails and [Rollbar](https://rollbar.com) for error
  tracking. Optional: Google Analytics, Slack, Crisp.chat.

### Ports

| Port | Service |
|------|---------|
| 7442 | API over plain HTTP, kept for legacy devices without TLS |
| 7443 | API over HTTPS |
| 1883 | MQTT |
| 8883 | MQTT over TLS |
| 80 / 443 | Console and API through Traefik |
| 7475 | Status transformers (internal network only) |

### Quick start with Docker Compose

THiNX keeps its data under `/mnt/data` by default, so make sure that directory exists. Then:

``` bash
git clone https://github.com/suculent/thinx-device-api.git
cd thinx-device-api
cp .env.dist .env
nano .env            # set your hostnames, passwords and keys
./copy-envs.sh
docker-compose up -d --build
```

You don't need Mailgun for a development install. When you create your first admin account, take the activation link
from the API log (`docker-compose logs -f`). `.circleci/config.yml` shows the full set of steps CI uses.

### Docker Swarm

In Swarm, THiNX expects a Traefik load balancer (Swarmpit is a handy companion). `docker-swarm.yml` already carries the
Traefik labels. It also expects `/mnt/data` to be shared storage on every node. We use GlusterFS, so the API, console,
broker, worker and builders can run anywhere and still see the same files.

On a manager node:

``` bash
git clone https://github.com/suculent/thinx-device-api.git
cd thinx-device-api
docker network create --scope=swarm nat
docker stack deploy -c ./docker-swarm.yml thinx
sudo ./scripts/install-log-retention-cron.sh
```

The last command sets up log retention. It installs `/usr/local/sbin/thinx-log-retention.sh` and a daily
`/etc/cron.d/thinx-log-retention` entry at 09:40 UTC. By default it deletes audit logs and build records older than
365 days and keeps build folders. `./scripts/stack-deploy` runs this step for you.

To delete old build folders too, do a dry run first and check the counts, then switch the schedule:

``` bash
sudo /usr/local/sbin/thinx-log-retention.sh
sudo ./scripts/install-log-retention-cron.sh --force --roots deploy,repos
```

Use `--time HH:MM` for another time slot, and run the script again with `--force` to change an existing schedule. To
turn retention off, delete `/etc/cron.d/thinx-log-retention`.

You can run several THiNX instances in one swarm. Give each instance its own plain-HTTP API port (for example 7442 for
production and 7441 for staging), because Swarm won't publish the same port for two services.

### The management console

Build your own console image. The build bakes environment-specific values (hostnames, API keys) into the static files.
The `thinxcloud/console` images on Docker Hub are built for thinx.cloud and won't point at your server. The
`build-vue-console` and `build-console-classic` jobs in `.circleci/config.yml` list the build arguments you need.

### GitHub webhooks

Add a deploy key from GitHub to THiNX, then point the repository's webhook at `https://<your-api-host>/api/githook`
(for the hosted service, `https://rtm.thinx.cloud/api/githook`). When you add a source, you can also enter a GitHub
webhook secret; THiNX then validates the signature of every incoming hook.

### API endpoints

The endpoints aren't documented separately yet. The route modules in `lib/router.*.js` and the specs in `spec/jasmine/`
are the reference for now.

### Logging

Use whichever log service and shipping agent you like. [Logz.io](https://logz.io), [Instana](https://www.instana.com)
and [Sematext](https://sematext.com) have all worked.

### Upgrading from before 1.1.5200

After an upgrade from a version older than `1.1.5200`, you may lose access to CouchDB. Fix it inside the `couchdb`
container: in `/opt/couchdb/etc/vm.args`, change the auto-generated name on the last line to `couchdb@localhost`.

## Development

You don't need every service running locally. Start the ones you need as containers and map them to the compose
service names in `/etc/hosts`.

Redis:

``` bash
docker run -ti -p 6379:6379 -e REDIS_PASSWORD=changeme! thinxcloud/redis:latest
```

CouchDB (Docker Hardened Images need a Docker Hub login):

``` bash
docker login dhi.io
docker run -p 5984:5984 -e COUCHDB_USER=rtmtest -e COUCHDB_PASSWORD=rtmtest dhi.io/couchdb:3
```

### Roadmap entropy detector

`scripts/roadmap-entropy.js` is a small, dependency-free checker for the GSD planning files under `.planning/`
(`ROADMAP.md`, `REQUIREMENTS.md`, `MILESTONES.md`). It catches scope creep and drift before they pile up, and adds the
findings into an entropy score (high = 3, medium = 2, low = 1). It looks for four things:

* Traceability drift: active requirements with no phase, and phases citing requirement IDs that don't exist.
* Coverage drift: traceability entries that disagree with what the phase actually declares in `ROADMAP.md`.
* Scope creep: requirement IDs that are tracked but never defined, and "out of scope" features showing up again as active requirements.
* Staleness: unchecked items under a shipped (`✅`) milestone, and an in-progress (`🔄`) milestone whose phases are all done.

Requirements of shipped milestones live in `.planning/milestones/*-REQUIREMENTS.md`, so the cross-checks only look at
the current milestone.

``` bash
npm run roadmap-entropy                        # summary
node scripts/roadmap-entropy.js --verbose      # every finding in detail
node scripts/roadmap-entropy.js --json         # machine-readable report
node scripts/roadmap-entropy.js --threshold=10 # exit 1 if the score is above 10
node scripts/roadmap-entropy.js --strict       # exit 1 on any finding
```

It exits `0` unless you set a threshold and the score goes over it, so you can gate CI on it without breaking the
default run.

## Platform notes

THiNX runs as separate container services: the API, CouchDB, Redis, Mosquitto, transformers, workers and Traefik, plus
optional monitoring. Data and configuration live under `/mnt/data` by default:

``` bash
deploy/    # built firmware, ready for devices
mosquitto/ # broker auth, logs, config and data
repos/     # fetched and watched repositories
ssh_keys/  # deploy keys (moving to a vault, used only by the builder)
ssl/       # shared certificates, for example from Traefik/ACME
```

Where each firmware platform stands, from our last round of testing:

| Platform | Builder | Over-the-air update |
|----------|---------|---------------------|
| Arduino ESP8266/ESP32 | ✅ | ✅ |
| PlatformIO | ✅ | ✅ |
| MicroPython | ✅, needs tighter integration with sources | deployment not verified yet |
| NodeMCU | ✅, needs tighter integration with sources (`$workdir`) | file-based update pre-tested; deployment not verified. Likely to be deprecated: its toolchain has seen no updates for years. |
| Pine64 | builder and platform support ready | waiting for firmware |

## License

ISC, see [LICENSE](./LICENSE).

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-device-api?ref=badge_large)
