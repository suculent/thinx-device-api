# thinx-message-broker

Standard Mosquitto MQTT server using file-based password authentication and ACL.
Features incron daemon, that takes care of automatically reloading the Mosquitto configuration while authentication data or configuration changes.

Distributed without working SSL configuration, because that depends on hostname. Provided files and possible `.env.dist` template for `.env` file are only for reference – to know what is where.

Expects root data folder at /mnt/data/mosquitto with following sub-folders:

### /auth
* thinx.pw
* thinx.acl

### /config
* mosquitto.conf

### /data

### /log

### /ssl
* ca.pem
* cert.pem
* privkey.pem

> Certificates must match domain called from device firmware!