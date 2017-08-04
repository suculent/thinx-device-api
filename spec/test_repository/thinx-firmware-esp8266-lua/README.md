# thinx-firmware-esp8266-lua

THiNX ESP8266 Vanilla Firmware for NodeMCU (LUA)

### Prerequisites

* [Free THiNX Account](https://rtm.thinx.cloud)

* ESP8266-based microcontroller
* NodeMCU firmware with following modules: `cjson, mqtt, net, wifi`
* ESPlorer or any other compatible IDE

### Tools

* [NodeMCU Firmware Builder](https://nodemcu-build.com) - customize your NodeMCU LUA firmware

* [ESPTool](https://github.com/espressif/esptool) - upload your firmware, erase flash, de-brick

* [ESPlorer](https://github.com/4refr0nt/ESPlorer) - edit/upload your LUA code to device

* [MQTT.fx](http://www.mqttfx.org) - subscribe/post to the message queue

* [NodeMCU DevKit](http://nodemcu.com/index_en.html) - explore original devkit


### How to

1. **Create** your own [THiNX Account](https://rtm.thinx.cloud)

2. After validating your account, go to API Keys page and create new **API Key** for this device _(it will be shown only once to you, make sure you have a copy in your clipboard)_.

3. Insert this API Key as `THINX_API_KEY` along with your owner-id as `THiNX_OWNER_ID` into the **config.lua** file. You should also adjust your `wifi_ssid` and `wifi_password` credentials, until those are injected using THiNX Environment Variables.

4. **Upload** `thinx.lua`, `config.lua` and `init.lua` to your ESP8266 (e.g. using ESPTool) and reboot.

5. The device should now **connect** to WiFi, check-in to the THiNX server and acquire its own unique device identifier (unless already registered).

6. As a next step it will connect to the **MQTT** Message Broker on its own channel `/devices/[owner_id]/[device_id]` and publish its status. It may receive response from the THiNX Messenger about available firmware update.

7. In case the device has `auto_update` enabled and source code update from attached attached repository is available, it should perform self-update and reboot.

8. THiNX now supports building whole NodeMCU firmware using the dockerized builder. In near future, it will allow for module customization.

### Future features

* Custom Firmware Builder
