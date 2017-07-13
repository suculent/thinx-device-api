-- beginning of machine-generated header
-- This is an auto-generated stub, it will be pre-pended by THiNX on cloud build.

majorVer, minorVer, devVer, chipid, flashid, flashsize, flashmode, flashspeed = node.info()

-- build-time constants
THINX_COMMIT_ID = "c9ecb8f6c7926d2b1524a201378d979230c372c2"
THINX_FIRMWARE_VERSION_SHORT = majorVer.."."..minorVer.."."..devVer
THINX_FIRMWARE_VERSION = "nodemcu-esp8266-lua-"..THINX_FIRMWARE_VERSION_SHORT
THINX_UDID = node.chipid() -- each build is specific only for given udid to prevent data leak


-- dynamic variables (adjustable by user but overridden from API)
THINX_CLOUD_URL="thinx.cloud" -- can change to proxy (?)
THINX_MQTT_URL="thinx.cloud" -- should try thinx.local first for proxy
THINX_API_KEY="88eb20839c1d8bf43819818b75a25cef3244c28e77817386b7b73b043193cef4"
THINX_DEVICE_ALIAS="nodemcu-lua-test"
THINX_DEVICE_OWNER="eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f"
THINX_AUTO_UPDATE=true

THINX_MQTT_PORT = 1883
THINX_API_PORT = 7442 -- use 7443 for https

THINX_PROXY = "thinx.local"

-- end of machine-generated code

-- BEGINNING OF USER FILE

wifi_ssid='HAVANA'
wifi_password='1234567890'
