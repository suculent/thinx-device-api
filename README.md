# thinx-device-api

Server application running on node.js. Serves as an IoT device registration endpoint. Should store device data using Couch or MongoDB.

## Prerequisites

* Application runs on HTTP port 7442 (possibly HTTPS 7441)
* EAV Device with firmware version higher than 0.4.0

## Endpoints

### /api/login

```
curl -H "User-Agent: THiNX-Web" \
-H "Content-Type: application/json" \
-X POST -d '{ "username" : "test", "password" : "test" }' \
http://localhost:7442/api/login
```

### /api/build

-=[ ☢ THiNX IoT RTM BUILDER ☢ ]=- endpoint.

Fetches GIT repository for given owner, builds his project, deploys binary and posts an FCM notification in case of successful update for respective devices.

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

### /device/register

Main registration endpoint. Serves for monitoring device firmware versions.

Usage example:

User agent must be set properly or the request will be rejected.

Push token, alias and owner parameters are optional. Has is optional for backwards compatibility only, otherwise it's required since EAV firmware 0.4.1.

    curl -H "User-Agent: THiNX-Client" \
    -H "Content-Type: application/json" \
    -X POST -d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "push-registration-token-optional", "alias" : "test", "owner": "admin" } }' \
    http://thinx.cloud:7442/device/register

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

