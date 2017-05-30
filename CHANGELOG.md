# ☢ thinx-device-api change log

## Change log

**ROADMAP**

It seems to be almost done. Let's have a week for fixing bugs and tweaking. There are still things that would not work after initial install (tech tail, e.g. mqtt configuration and other post-installs; bulk UI operations though update functions)

* 1: Async log should write to logfile instead of shellscript for tailing.
* 2: Builder Logging, build tests
* 3: Bare data support (LUA/uPy) for dumb firmwares (there is a lot of them)
* 4: Improve statistics (count last 24 hours or something)
* 5: Make devices respond/receive MQTT messages (LUA first)

### 9th week

30/5/2017 - 1.5.1230: fixes in websocket, build-log and build-logger

29/5/2017 - 1.5.1208: fixes UI in proxy, api keys and statistics

26/5/2017 - 1.5.1180: fixes in UI, logging, builder, sockets, logout

### Eight week

27/5/2017 - 1.5.1158: various fixes and refactoring; working on builder/logger; separating user workspaces per build id

26/5/2017 - 1.5.1122: migrated from Apache to NGINX; updated node.js to v7.10; linting code with Sonarqube; designing MQTT architecture with AirSensor/2

25/5/2017 - added integrations with Support Desk, Uptime Robot

24/5/2017 - 1.5.1104: replaced MQTT implementation on the device side, working websocket log-tail

23/5/2017 - 1.5.1080: fixes and fortification with aim to prevent DDoS attacks, tested CloudFlare; evening off...

22/5/2017 - 1.5.1062: working on audit/build log; test coverage

### Seventh week

21/5/2017 - 1.5.1053: realtime Web socket log-tail; fixed weeks-old Arduino issue (actually in the parser!)

20/5/2017 - 1.5.1020: added Rollbar; added statistics with log tagging; bumped from 11 to 48% test coverage; MQTT authentication tested on device; example Web socket connection and working on log-tail implementation; aligned registration responses with firmware expectations

19/5/2017 - 1.5.962: successfully tested registration with Robodyn D1; introduced Web socket log-tail against runtime log, still working on statistics and popover; migrating fully to Redis API Key store; completed migration to udid; changed statistics directory structure; solved long-term issue with couch queries (bad doc)

18/5/2017 - 1.5.886: migrating to UDID from MAC; adding Redis API Key store; evening off...

17/5/2017 - 1.5.880: test coverage reports; circle.ci tests; added source_id; version bump (changed UI API security requirements, intentionally not backwards compatible)

16/5/2017 - 1.4.868: profile, sparkline chart, log UI

15/5/2017 - 1.4.860: adjusted logging to trackable, added statistics aggregator, security audit and code-quality checks using SonarQube,

### Fifth week

14/5/2017 - 1.4.850: base build logs; working on statistics aggregator, added tests; profile editing; device editing; migration to udid in requests

13/5/2017 - 1.4.800: all current tests pass

12/5/2017 - 1.4.737: added HTTPS-endpoint for proxy; working device renaming and LUA/Arduino registration

11/5/2017 - 1.4.722: big laundry done; added HTTPS-proxy; build progress tracking, prototyping Redis API Key storage

10/5/2017 - fixing regressions and bugs

9/5/2017 - major refactoring

8/5/2017 - 1.4.603: Watching sources repositories attached to devices for changes, enabled build logger, updated build directory/repository structure, simplified registration request (should not require 'owner' parameter anymore); advanced update-notifier implementation; database compact job

### Fourth week

7/5/2017 - 1.3.585: Added API endpoints for fetching audit log, build log list and build log (incomplete), builder now saves build logs next to build/envelope file with same filename (build-id)

6/5/2017 - 1.3.581: Core client implementation templates for ESP8266/NodeMCU LUA and Micropython-based firmwares (registration and SPIFFS only, no OTA, not tested)

5/5/2017 - 1.3.576: improved tests, enabled editing device alias through API, working logrotate; working device registration step (with issues only on device side)

3/5/2017 - 1.3.559: API key now requires alias, audit logging

2/5/2017 - 1.3.550: changed build API to secure, updated tests; UI advancements (attach/detach/build)

### Third week

1/5/2017 - 1.2.533: re-tested and improved device registration, new UI

29/4/2017 - 1.2.516: working login, API and RSA key creation and revocation, session,

28/4/2017 - 1.2.489: stabilized nightly build, added device/attach and device/detach endpoints to add firmware repositories to devices, stub for static firmware serving

27/4/2017 - 1.2.413: REDIS Session Management, Startup Service, API for listing/adding RSA-keys; session-store is safe now; key revocation requires DELETE request and is based on key-hash now as the API Key is not shown more than once anymore.

26/4/2017 - 1.1.344 Fixing bugs and analyzing Session issue

25/4/2017 - 1.1.339 Working repository list

24/4/2017 - 1.1.317 Working account creation and password reset

### Second week

23/4/2017 - 1.1.249:: never store passwords. advancing in activation/password set/reset

19/4/2017 - 1.1.219: API Key revocation (from UI)

18/4/2017 - 1.1.203: Secure endpoints for listing and generating new API keys

### First week

16/4/2017 - 1.0.12: Created asynchronous polling git-watcher (Repository class), improved tests

15/4/2017 - 1.0.0: Semantic versioning, firmware update-on-checkin, Deployment, Envelopes, UDID,
Device registration with API key

14/4/2017 - 0.3.0: Express Router, Security (api_key, origin, fixes, device router)

13/4/2017 - 0.2.0: Thinx header, Circle CI, tests and ESLint

12/4/2017 - 0.0.6: Rewritten API router, working authentication

11/4/2017 - 0.0.5: MQTT/Slack Notifications, Sessions

10/4/2017 - 0.0.2: Builder and notifier

09/4/2017 - 0.0.1: Device registration
