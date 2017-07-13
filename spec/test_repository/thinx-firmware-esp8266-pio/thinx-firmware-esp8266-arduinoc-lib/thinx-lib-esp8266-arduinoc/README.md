# THiNX Lib (ESP)

An Arduino/ESP8266 library to wrap client for OTA updates and RTM (Remote Things Management) based on THiNX platform.

# Useage
## Include

```c
#include "things-lib-esp.h"

```

## Definition
### THiNX Library

The singleton class started by library should not require any additional parameters except for optional API Key.
Connects to WiFI and reports to main THiNX server; otherwise starts WiFI in AP mode (AP-THiNX with password PASSWORD by default)
and awaits optionally new API Key (security hole? FIXME: In case the API Key is saved (and validated) do not allow change from AP mode!!!).

* if not defined, defaults to thinx.cloud platform
* TODO: either your local `thinx-device-api` instance or [currently non-existent at the time of this writing] `thinx-secure-gateway` which does not exist now, but is planned to provide HTTP to HTTPS bridging from local network to

```c
#include "Arduino.h"
#include "Thinx.h"
#include "./thinx-lib-esp8266-arduinoc/src/thinx-lib-esp.h"
// #include "<thinx-lib-esp.h>" // one day

THiNX* thx = NULL;

void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.setDebugOutput(true);  
  thx = new THiNX(thinx_api_key);
  Serial.println("Setup completed.");
}

void loop()
{
  // do what you want to...
}

```
