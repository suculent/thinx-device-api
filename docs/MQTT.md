# MQTT

Main purpose of MQTT in THiNX is the *Device Status*. It does not work without that (shows only last connected time).

Secondary purposes are:

* firmware update (multi-file+ott)

* generic messaging

There are two designated channels:

**/owner_id/udid/status** - for status (connected/disconnected) messages

Device SHOULD send following messages to this channel:

		{ "status": "connected" }

		{ "status": "disconnected" } (as MQTT Last Will)

**/owner_id/udid** - for user communication with device
