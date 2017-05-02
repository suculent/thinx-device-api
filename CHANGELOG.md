# ☢ thinx-device-api change log

## Change log

### TODO:

» Notifier (finish prototype)
» Builder (finish prototype)
» Refactor to UDIDs instead of MACs and owner_id

### Last week

PLANS:

x Optimizace server use by moving couch to iot server
» Attach/detach repository to device and commence build
» [...] Device firmware (to support direct update)
» Aggregate statistic data from logs for graphs
» Testing, testing, testing...

2/5/2017 - 1.3.550: secured build API, updated tests; UI improvements (attach/detach/build)

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
