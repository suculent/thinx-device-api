# ☢ thinx-device-api change log

## HISTORY

26/1/2021 1.4.8291

» Major update
» Internal fixes and improvements, refactoring
» Separate CNAME for API is not required anymore
» Breaking change in config file format (Slack block

3/4/2021 1.3.7723

» GoAuth ACL fixes
» UI fixed on build

27/3/2021 1.3.7609

» GoAuth Mosquitto support with separable Redis instance
» UI and other fixes and improvements in build process
» Fixes in DevSec and Firmware - signature calculation with proper FCID

20/2/2021 1.3.7577

» Preparing migration to GoAuth plugin for Mosquitto (ACLs and authentication is stored in Redis instead of flatfiles)

5/2/2021 1.3.7437

» Build process fixes
» Improved PlatformIO support (environments, targets)
» Full HTTPS/MQTTS with THiNX firmware supported
» Better support for external API control (device environment values)
» Mesh support (specific comm channels for device groups)

1/11/2020 1.1.5206

Long time no see, just a quick summary:

» Updated to full 12FA, tested with Docker Swarm
» Multiple parallel builds allowed
» Parametrizing per-device builds using environment variables API

19/7/2019 1.0.4553

» Stable docker-compose install with console included
» Replaced HotJar with Crisp.chat

3/7/2019 1.0.x

» Migrated to docker-compose based container architecture

2/6/2019 0.9.4030

» Added distaster recovery feature for MQTT branch after losing the MQTT passwords file

27/5/2019 0.9.3992

» Updating history after a very, very, very long time... the project is settling.
» Updated security for MQTT (MQTTS support, no anonymous users allowed)
» Improved OTA over HTTPS/TLS on ESP32 and ESP8266
» Updated Arduino firmware

20/8/2018 0.9.3525

» Preparation for key-escrow and end-to-end encryption
» Vulnerability fixes and hashing optimizations
» Updating device statuses from MQTT
» Firmware availability check optimized
» Fixed creating mqtt_passwords
» Added support for DST and timezone offset
» Client IP trackings for anti-abuse monitoring
» Various OTT and warning fixes
» Docker transformer fixes
» Benchmarking response times
» Support for DST and device-specific timezones
» Migration to Circle CI 2.0 (in progress)
» Debugging various login edge-cases (no-email)

26/05/2018 0.9.3419

» Added SSL support on the library side for ESP8266/ESP32
» SHA-256 and MD5 hash validation support
» Updated builder for ESP8266/ESP32
» Fixed GitHub OAuth account creation
» Status Transformer Self-healing
» Optimized checkin (firmware provider)

18/05/2018

» Major fixes in Arduino ESP266/ESP32 builder

2/05/2018 0.9.3366:

» SigFox Downlink Support
» Fixes in Status Transformers
» JavaScript repos supported
» User accounts are deleted after 3 months of not being used (GDPR compliance)

19/04/2018 0.9.3296:

» Improved support for NodeJS clients
» Revamped Deploy Keys with support for Private repositories
» Stabilized status transformers and device checkins (even in libs)

13/04/2018 0.9.3230:

» Library fixes for Arduino, ESP8266/ESP32 and test/specs
» Upgraded and fixed implementation to @slack/client 4.0
» Improved Status Transformers

25/03/2018 0.9.3144:

» Status Transformer Sandbox Execution Environment
» GDPR and Revocation improvements
» Fixed device revocation
» NodeJS Client Docker `suculent/thinx-node-docker`

23/03/2018 0.9.3128:

» Static file provider
» Status Transformer integration with Slack and Grafana
» GDPR, content download provider
» NodeJS client library

15/03/2018 0.9.3088:

» Implementing GDPR consent request, refactoring authentication procedure
» Google/GitHub OAuth login fixes and improvements
» Updated git-hooks, preparing dockerized staging installer

05/03/2018 0.9.3058:

» fixes to Status key storage reliability (Value Histories will move to InfluxDB soon but status histories will remain)
» test fixes and testing with Redis 4 and CouchDB 2.1
» timestamp support
» full disaster recovery tests

15/02/2018 0.9.3036:

» added base implementation for manual transformer action (dry-run)
» fixed new implementation of device revocation
» prevented saving uninitialized sessions to Redis (clutter)
» new user will have empty default transformers, because without device, those cannot be deleted
» vulnerable dependency fixes
» added missing user defaults
» improved name parser for oauth logins
» changes in default cookie expiration, removed rolling cookie to maintain custom expiration intervals for long-term logins
» added registration response to serve approximate time instead of complex NNTP
» fixed error/warning badge in transformers
» fixed unintentional password leak
» search different logfiles in case nothing is found (should be done much better, for /var/log/, better path without `..` etc.
» reordered audit test to create a record first
» other minor bugfixes

## 35th week (Pre-XMAS)

18/12/2018: 0.9.3010: deployed different LoraWAN Server (by gotthardp) using Docker; updating THiNXLib for MQTT integrations

## 34th week

16/12/2017: 0.9.29xx: storing MQTT traffic to redis, providing on API request (so far)
15/12/2017: 0.9.2971: stable release, all tests pass
14/12/2017: 0.9.2943: improving test coverage (5 failures resolved, 7 remaining)
13/12/2017: 0.9.2943: improving test coverage (3 failures resolved, 12 remaining)

## 33th week

06/12/2017: 0.9.2902: improved CouchDB security; testing restore from backup

## 32th week

28/11/2017: 0.9.2890: updating Arduino Docker builder with ESP32 support; logging support fixes

## 31th week

27/11/2017: Web UI updates, ESP32httpUpdate ported, initial release of THiNX32Lib for Arduino ESP32

26/11/2017: 0.9.2882: version bump: zipped artifacts, UI changes, MQTT ACL

23/11/2017: Rollbar and issues are automatically managed in JIRA as well, added JIRA/GitHub integration (10EUR/month)

22/11/2017: Build artifacts can be downloaded as of now.

21/11/2017: 0.9.2838 creating MQTT ACL on-the-run (new users and devices only); zipping and providing build artifacts; API Key and Source ownership migration

20/11/2017: added method for attaching additional "Push Notification Token" parameter to a device using API Key

## 31th week

19/11/2017: sprint review

18/11/2017:

17/11/2017:

16/11/2017: business-trip / day off

15/11/2017: business-trip / day off

14/11/2017: fixed Google login hangup

13/11/2017: 0.9.2798: installed experimental LoRa Server & Application Server; added notes only to the Dockerfile so far (may use https://hub.docker.com/r/loraserver/lora-app-server/ instead of installing into THiNX Docker container)

## 30th week

12/11/2017: 0.9.2796: fixed firmware versioning, error page, build status marker in log, updated builders

11/11/2017: 0.9.2778: bugfixes in versioning and builder, fixing log record

10/11/2017: 0.9.2758: added GitHub login and Status Transformer editor; bugfixes for Arduino builds and builds in general; still tailing lambdas...

9/11/2017: added prototype status transformer as a part of user profile

8/11/2017: 0.9.2682: Bugfixes, stabilized (Arduino) builder with new example project.

7/11/2017: Experimental byte-value transformer for (float) Battery voltages; library update with setStatus support

6/11/2017: minor fixes

## 29th week

5/11/2017: fixes, builder updates, OAuth redirects

4/11/2017: 0.9.2621 - Working Google+ login with creating new users on-the-fly; THiNXLib: Push Config (with callback), MDNS support for local proxy query and public MQTT methods; updated libraries and builders; published to PlatformIO library manager

3/11/2017: - Arduino builder: custom libraries from lib folder next to .ino file are now copied to libraries as installed by library manager, overwriting manager libraries installed using thinx.yml; Arduino library: updated for easy developer UX; universal OAuth support for UI

2/11/2017: 0.9.2562 - starting with Google+ OAuth2 implementation (via @PexMor); even faster platformio builds (via @IvanKravets)

1/11/2017: 0.9.2561 - historically first end-to-end device attempt to fetch firmware for update (ESP8266) using OTT

31/10/2017: 0.9.2540 - passing tests for PlatformIO/Arduino builds; optimized build speed for ESP8266/ESP32; firmware update offer testing positive

30/10/2017: 0.9.2484 - major update in Arduino library (working with/without WiFiManager, added working callback, added owner ID setting to captive portal); secondary test implementation also works (EAV)

## 28th week

27/10/2017: 0.9.2482 - major bugfixes in Arduino libraries (stable release)

24/10/2017: 0.9.2472 - fixed password reset, fixed statistics parser timer, reduced vulnerabilities

23/10/2017: 0.9.2464 - improvements and debugging the Password reset & Activation user journeys; passed tests of activation and password resets; explicit Location & SigFox support (additional attributes: status, snr, lat, lon and station)

### Break

### 23th week

19/9/2017: 0.9.2435 end-to-end integration of NodeMCU dockerized builder; added support for thinx.yml parametrization of build type (firmware/files) and firmware type (integer/float); updated logging to split both to console and logfile

18/9/2017: NodeMCU Lua firmware checkin tests

15/9/2017: code style and vulnerability fixes

### 22th week

10/9/2017: minor fixes (user delete)

8/9/2017: registered first SigFox device using callback API (just needs minor manual udid intervention)

7/9/2017: user account deletion

6/9/2017: bugfixes, random device naming, device icons, working on Slack integration...

5/9/2017: 0.9.2389: improved registration procedure, testing with multiple ESP8266 devices with PlatformIO IDE; added Code of Conduct and some basic Community rules (not reviewed); device icons supported

4/9/2017: 0.9.2380: fixed normalized MAC matching; working on Arduino firmware

### 21th week (after vacation)

3/9/2017: 0.9.2374: fixed duplicate username and e-mail creation; working on Arduino firmware

28/8/2017: 0.9.2349: Base Slack integration (SlackBot listening to incoming messages; web-socket forwarder ready); refactored registration, working Lua firmware example

26/8/2017: 0.9.2330: E-mail registration testing & fixes

### 20th week

21/8/2017: - Working MongooseOS builder and firmware prototype

20/8/2017: 0.9.2290 - Fixed device pruning, initial MongooseOS integration tests (blocked by get MAC issue)

17/8/2017: 0.9.2237 - Docker Build Parametrization using YML (dependency management), log sorting, fixing tests, remote configuration support for INO/PIO, solving issues with missing mosquitto_password tool in unit tests, signing builds, lint, landing page almost done.

16/8/2017: 0.9.2215 - Working Arduino and PlatformIO Docker builder incl. artifact collection; started working on landing page.

15/8/2017: 0.9.2203 - Restored Circle CI testing workflow; advancing Arduino Docker Build - directed path to workdir results in successful build start, but managed library <THiNXLib.h> needs to be fetched to local repo first (inside Docker builder image).

### 19th week

...getting stucked on SPIFFS-related crashes on Arduino, while doing a lots of fixes on UI...

8/8/2017: 0.9.2080 RELEASE - Minimal MongooseOS registration example for testing Docker builder; checking Lua module registration (fixed memory issues)

7/8/2017: 0.9.2060 - Starting MongooseOS project

### 18th week

6/8/2017: 0.9.2080

5/8/2017: - Testing and fixing platform-builders for PlatformIO and Arduino; first Device Init for Mongoose (library integration analysis); working logs from Docker

4/8/2017: 0.9.2020 - Working Docker images for all firmwares; working webhooks resulting with a git pull (`repository updated with timer` should deprecate soon)

3/8/2017: 0.9.1998 - Base Docker images for Arduino, Platformio and MongooseOS (problem with pip install in platformio?); UI tweaks; logging fixes;

2/8/2017: Dockerized install support

1/8/2017: Working on multi-file upload and multi-platform support on firmware update in order to align with Micropython/NodeMCU systems.

### 17th week

27/7/2017: 0.9.1921 - Working on state of union for Micropython/Lua/Arduino/Platformio Firmware Libraries. Extracted shared code for Arduino /Platformio in their respective repositories. Implemented file updates and messaging both on Lua/Micropython side (not tested so far) pinning version 0.9 as current alpha.

26/7/2017: 0.9.1912 - Actionable Notifications (send text/boolean responses to devices using MQTT directly from the web)

25/7/2017: 0.9.1903 - Finally working couchdb design document to delete old build-logs (after 7 days) and audit-logs (after 1 month); finally working MQTT subscribe/callback for Arduino-C/Platform.io; integrated MQTT and Websocket notifications

24/7/2017: Using platform in device list; integrating MQTT messenger

### 16th week

20/7/2017: 0.8.1838 - Using custom API Key on build; fixes and fighting nasty bug; eslint cleanup

19/7/2017: 0.8.1820 - Micropython docker-based builder; NodeMCU docker-based builder; integration; THiNX system library for nodemcu-firmware; pre-building apps to Micropython; MAC address normalization and other UI tweaks; NodeMCU, Micropython or MongooseOS firmware; websocket opens on login

18/7/2017: inferring source platform on prefetch, parametrized multi-language config builder; env-vars should be pre-built now

### 15th week

13/7/2017: fixed device registration for Lua firmware together with MQTT login and duplicate MAC record pruning

12/7/2017: platform attribute added to registration/UI

10/7/2017 - 0.7.1730: completed logtail implementation for all cases; fixed login redirect and updated certificates (shared)

### 14th week

VACATION DOWNTIME until 9/7/2017

---

4/7/2017 - 0.7.1706: secure websocket logtail; working on device transfer; injecting env-vars to current builder prototype

3/7/2017 - 0.7.168x: working on device transfer and logtail

### 13th week

2/7/2017 - 0.7.1664: tested/fixed user creation and password reset; origin fix; test script creating devices for multi transfer; added tests and implementation for device transfer with e-mail confirmation and optionally partial accept; not tested; integrated Messenger with Notifier

1/7/2017 - secure web socket, platform.io builder/logger integration

30/6/2017 - MQTT messenger, refactoring, fixes, IP blacklisting

29/6/2017 - weekly statistics and logout

28/6/2017 - session cookie for "remember me"

27/6/2017 - technical debt fixes and generating thinx.h in new format for C/C++

26/6/2017 - 0.7.1542: refactoring, cleanup, audit/build log fixes

### 12th week

25/6/2017 - semver-related fixes, cleanup

24/6/2017 - extracted avatar from database to file

23/6/2017 - 0.7.1500: added deploy-hook (hook fails but nothing is fetched, use pm2 pullAndRestart ft.); fixed Enviro revocations, version bump due to OTT support and multiple firmware OS builders; fixed user logout (+ also on invalid session)

22/6/2017 - 0.6.1486: buffer responses are now binary as expected; added support for secure API environment variables (for Micropython/Lua parametrization); published all five variants of firmware base repositories

21/6/2017 - 0.6.1465: fixed builder; OTT (One-Time-Token) update supported; (OTT will mean version bump to 1.7)

### 11th week

18/6/2017 - finalizing bulk revocation; 3D printer arrived so there's a bit of distraction

15-16/6/2017 - refactoring Arduino C example and C++ library (roadmap task 5)

12/6/2017 - 0.6.1412: advancing in test coverage, fixing bugs

### 10th week

9/6/2017 - completing required tests; lots of work but still not done. fixed back to shell tests for compatibility

9/6/2017 - 0.6.1382: aligned firmware implementation for 'owner' attribute; re-tested (Arduino OK); updated tests (at least does not break the owner, but later...)

8/6/2017 - 0.6.1380: completing post-refactoring fixes

7/6/2017 - 0.6.1322: post-refactoring fixes

6/6/2017 - 0.6.1268: extended API Key format to prevent collisions; testing and fixing refactoring changes merged to master (staging phase).

5/6/2017 - 0.5.1280: General refactoring for testability

### 9th week

3/6/2017 - 0.5.1265: started general refactoring with batch support, working tests on UI side, batch support fixed in RSA Keys for testing

2/6/2017 - 0.5.1258: fixes in builder and logger; flood-testing

30/5/2017 - 0.5.1230: fixes in websocket, build-log and build-logger

29/5/2017 - 0.5.1208: fixes UI in proxy, API Keys and statistics

26/5/2017 - 0.5.1180: fixes in UI, logging, builder, sockets, logout

### Eight week

27/5/2017 - 0.5.1158: various fixes and refactoring; working on builder/logger; separating user workspaces per build id

26/5/2017 - 0.5.1122: migrated from Apache to NGINX; updated node.js to v7.10; linting code with Sonarqube; designing MQTT architecture with AirSensor/2

25/5/2017 - added integrations with Support Desk, Uptime Robot

24/5/2017 - 0.5.1104: replaced MQTT implementation on the device side, working websocket log-tail

23/5/2017 - 0.5.1080: fixes and fortification with aim to prevent DDoS attacks, tested CloudFlare; evening off...

22/5/2017 - 0.5.1062: working on audit/build log; test coverage

### Seventh week

21/5/2017 - 0.5.1053: realtime Web socket log-tail; fixed weeks-old Arduino issue (actually in the parser!)

20/5/2017 - 0.5.1020: added Rollbar; added statistics with log tagging; bumped from 11 to 48% test coverage; MQTT authentication tested on device; example Web socket connection and working on log-tail implementation; aligned registration responses with firmware expectations

19/5/2017 - 0.5.962: successfully tested registration with Robodyn D1; introduced Web socket log-tail against runtime log, still working on statistics and popover; migrating fully to Redis API Key store; completed migration to udid; changed statistics directory structure; solved long-term issue with couch queries (bad doc)

18/5/2017 - 0.5.886: migrating to UDID from MAC; adding Redis API Key store; evening off...

17/5/2017 - 0.5.880: test coverage reports; circle.ci tests; added source_id; version bump (changed UI API security requirements, intentionally not backwards compatible)

16/5/2017 - 0.4.868: profile, sparkline chart, log UI

15/5/2017 - 0.4.860: adjusted logging to trackable, added statistics aggregator, security audit and code-quality checks using SonarQube,

### Fifth week

14/5/2017 - 0.4.850: base build logs; working on statistics aggregator, added tests; profile editing; device editing; migration to udid in requests

13/5/2017 - 0.4.800: all current tests pass

12/5/2017 - 0.4.737: added HTTPS-endpoint for proxy; working device renaming and Lua/Arduino registration

11/5/2017 - 0.4.722: big laundry done; added HTTPS-proxy; build progress tracking, prototyping Redis API Key storage

10/5/2017 - fixing regressions and bugs

9/5/2017 - major refactoring

8/5/2017 - 0.4.603: Watching sources repositories attached to devices for changes, enabled build logger, updated build directory/repository structure, simplified registration request (should not require 'owner' parameter anymore); advanced update-notifier implementation; database compact job

### Fourth week

7/5/2017 - 0.3.585: Added API endpoints for fetching audit log, build log list and build log (incomplete), builder now saves build logs next to build/envelope file with same filename (build-id)

6/5/2017 - 0.3.581: Core client implementation templates for ESP8266/NodeMCU Lua and Micropython-based firmwares (registration and SPIFFS only, no OTA, not tested)

5/5/2017 - 0.3.576: improved tests, enabled editing device alias through API, working logrotate; working device registration step (with issues only on device side)

3/5/2017 - 0.3.559: API key now requires alias, audit logging

2/5/2017 - 0.3.550: changed build API to secure, updated tests; UI advancements (attach/detach/build)

### Third week

1/5/2017 - 0.2.533: re-tested and improved device registration, new UI

29/4/2017 - 0.2.516: working login, API and RSA key creation and revocation, session,

28/4/2017 - 0.2.489: stabilized nightly build, added device/attach and device/detach endpoints to add firmware repositories to devices, stub for static firmware serving

27/4/2017 - 0.2.413: REDIS Session Management, Startup Service, API for listing/adding RSA-keys; session-store is safe now; key revocation requires DELETE request and is based on key-hash now as the API Key is not shown more than once anymore.

26/4/2017 - 0.1.344 Fixing bugs and analyzing Session issue

25/4/2017 - 0.1.339 Working repository list

24/4/2017 - 0.1.317 Working account creation and password reset

### Second week

23/4/2017 - 0.1.249:: never store passwords. advancing in activation/password set/reset

19/4/2017 - 0.1.219: API Key revocation (from UI)

18/4/2017 - 0.1.203: Secure endpoints for listing and generating new API keys

### First week

16/4/2017 - 0.1.12: Created asynchronous polling git-watcher (Repository class), improved tests

15/4/2017 - 0.1.0: Semantic versioning, firmware update-on-checkin, Deployment, Envelopes, UDID,
Device registration with API key

14/4/2017 - 0.3.0: Express Router, Security (api_key, origin, fixes, device router)

13/4/2017 - 0.2.0: Thinx header, Circle CI, tests and ESLint

12/4/2017 - 0.0.6: Rewritten API router, working authentication

11/4/2017 - 0.0.5: MQTT/Slack Notifications, Sessions

10/4/2017 - 0.0.2: Builder and notifier

09/4/2017 - 0.0.1: Device registration
