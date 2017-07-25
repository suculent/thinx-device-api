# MQTT

Main purpose of MQTT in THiNX is the *Device Status*. It does not work without that (shows only last connected time).

Secondary purposes are:

* firmware update (multi-file+ott)

* generic messaging

There are two designated channels:

**/owner_id/udid/status** - for status (connected/disconnected/registration) messages

Device SHOULD send following messages to this channel:

		{ "status": "connected" }

		{ "status": "disconnected" } (as MQTT Last Will)
		
Device CAN send following message to this channel in order to aquire possible firmware update:

        { "registration":
            { "mac":"5CCF7FE4631D",
              "firmware":"thinx-firmware-esp8266-1.7.24:2017-07-25",
              "version":"1.7.24",
              "commit":"24e715f7fb5dc3ebe228165dae45fa933fade1bd",
              "owner":"cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12",
              "alias":"robotdyn-mega+wifi",
              "platform":"platformio"
            }
        }
        
        The 'commit' and 'alias' parameters can be safely omitted.

**/owner_id/udid** - for user communication with device
