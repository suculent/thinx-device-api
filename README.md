# ☢ thinx-device-api

[![Coverage Status](https://coveralls.io/repos/github/suculent/thinx-firmware-esp8266/badge.svg?branch=master)](https://coveralls.io/github/suculent/thinx-firmware-esp8266?branch=master)

API Server running on node.js.

• Serves as an IoT device registration endpoint while soring device data using remote CouchDB server.

• Application is a back-end data provider (security agent) for RTM admin console running on the same server (currently on Apache, but should converge to node.js).

• Provides control to a build server that pushes new firmware versions to client applications (FCM push) and devices (MQTT).

## Supported IoT Platforms

* ESP8266 (thinx-firmware-esp8266)
* Expected: Arduino

## Prerequisites

* Linux Server (possibly RasPi but not tested)
* Application runs on HTTP port 7442 (possibly HTTPS 7441)
* Admin runs on HTTPS port (443)

## Endpoints

### /

Redirects to web-app for authenticated user, otherwise returns `This is API ROOT.`


### /logout

Terminates current session. Redirects to web root.


### /api/login

Authentication point, that client application must pass before performing authorized operations (view owner data, start builds, initiate OTA updates).
Expects username and password as an input (POST body), returns session cookie in case of valid authentication.
Session cookie can be used to access owner data or start owner/admin builds and it is configurable in code using express.js

```
curl -H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "username" : "test", "password" : "tset" }' \
http://localhost:7442/api/login
```
---

### /api/view/devices

Provides **intial draft** device list for authorized owner. Requires no parameters, just valid session.

```
curl -v -c cookies.jar \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "username" : "test", "password" : "test" }' \
http://localhost:7442/api/login

curl -v -b cookies.jar \
-H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "query" : false }' http://localhost:7442/api/view/devices
```

> All devices are returned in case user has an `admin` tag set to true in session. Must be inferred from database where it can be set manually through SSL tunnelling to CouchDB administration, which is otherwise only locally accessible on the server (security purposes).

Sample response:

```
{ "devices" :
{"id":"11:11:11:11:11:11","key":"test","value":{"_id":"11:11:11:11:11:11","_rev":"46-1c5e7beee91056cf3e185664b397d116","mac":"11:11:11:11:11:11","firmware":"EAV-App-0.4.0-beta:2017/04/08","hash":"e58fa9bf7f478442c9d34593f0defc78718c8732","alias":"rabbit","lastupdate":"2017-04-10T23:40:31.548Z","push":"d877126b0b76fe086d63679c8d747423e7b4a1bdb4e1679e59216732b7060f03","owner":"test"}}
}

```

---

### /api/build

Builder endpoint. Fetches GIT repository for given owner, builds his project, deploys binary and posts an FCM notification in case of successful update for respective devices.

> Will require valid session with authorized user in future.

Usage example:

```
curl -H "User-Agent: THiNX-Client" \
-H "Content-Type: application/json" \
-X POST -d '{ "build" : { "mac" : "ANY", "owner" : "test", "git" : "https://github.com/suculent/thinx-firmware-esp8266", "dryrun" : true } }' \
http://localhost:7442/api/build
```

• HTTP POST JSON body:

    {
        "build" : {
            "mac" : "ANY",
            "owner" : "test",
            "git" : "https://github.com/suculent/thinx-firmware-esp8266",
            "dryrun" : true
        }
    }

---

### /device/register

Main registration endpoint. Serves for monitoring device firmware versions.

Devices must use `Origin: device` header to circumvent Access-Control.

Usage example:

User agent must be set properly or the request will be rejected.

Push token, alias and owner parameters are optional. Has is optional for backwards compatibility only, otherwise it's required since EAV firmware 0.4.1.

```
curl -H 'Origin: device' -H "User-Agent: THiNX-Client" \
-H "Content-Type: application/json" \
-X POST -d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "push-registration-token-optional", "alias" : "test", "owner": "admin" } }' \
http://thinx.cloud:7442/device/register
```

• HTTP POST JSON body:

    {
        "registration" : {
            "mac" : "00:00:00:00:00:00",
            "firmware" : "EAV-App-0.4.0-beta:2017/04/08",
            "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732",
            "push" : "push-registration-token-optional",
            "alias" : "test",
            "owner": "admin"
        }
    }

• POSSIBLE RESPONSES

Registration failed:

    {
        "registration" : {
            "success" : false,
            "status" : "reason: generic fail"
        }
    }

Registration succeeded, firmware update available:

    {
        "registration" : {
            "success" : true,
            "status" : "FIRMWARE_UPDATE",            
            "url" : "/bin/test/firmware.elf",
            "mac" : "5C:CF:7F:EE:90:E0;ANY",
            "commit" : "18ee75e3a56c07a9eff08f75df69ef96f919653f",
            "version" : "0.1",
            "sha256" : "6bf6bd7fc983af6c900d8fe162acc3ba585c446ae0188e52802004631d854c60"
        }
    }


Registration succeeded, no new firmware:

    {
        "registration" : {
            "success" : true,
            "status" : "OK"
        }
    }

Registration succeeded, new device alias:

    {
        "registration" : {
            "mac" : "00:00:00:00:00:00",
            "status" : "OK",
            "alias" : "test"
        }
    }


TODO Registration succeeded, new device registration with one-time token:

    {
        "registration" : {
            "success" : true,
            "status" : "OK",
            "device_id" : "xyz"
        }
    }


## Changelog

12/4/2017 - Rewritten API router, working authentication
11/4/2017 - MQTT/Slack Notifications, Sessions
10/4/2017 - Builder and notifier
09/4/2017 - Device registration
