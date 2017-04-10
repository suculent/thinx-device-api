# thinx-device-api

Server application running on node.js. Serves as an IoT device registration endpoint. Should store device data using Couch or MongoDB.

## Prerequisites

* Application runs on HTTP port 7442 (possibly HTTPS 7441)
* EAV Device with firmware version higher than 0.4.0

## Endpoints

### `SERVER_URL`/register

Usage example:

User agent must be set properly or the request will be rejected.

Push token, alias and owner parameters are optional. Has is optional for backwards compatibility only, otherwise it's required since EAV firmware 0.4.1.

    curl -H "User-Agent: THiNX-Client" \
    -H "Content-Type: application/json" \
    -X POST -d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "push- registration-token-optional", "alias" : "test", "owner": "admin" } }' \
    http://localhost:7442/api/login

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
            "url": "/bin/eav/3b19d050daa5924a2370eb8ef5ac51a484d81d6e.bin"
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
