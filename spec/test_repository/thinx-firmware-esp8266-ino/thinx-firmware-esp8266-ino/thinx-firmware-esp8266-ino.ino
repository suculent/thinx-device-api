/* OTA enabled firmware for Wemos D1 (ESP 8266, Arduino) */

#include "Arduino.h"

#include "./thinx-lib-esp8266-arduinoc/src/thinx.h"
#include "./thinx-lib-esp8266-arduinoc/src/thinx-lib-esp.h"

THiNX* thx = NULL;

void setup() {
  
  Serial.begin(115200);
  
#ifdef DEBUG
  while (!Serial);
  Serial.setDebugOutput(true);
#endif

  thx = new THiNX(thinx_api_key);
}

void loop()
{
  delay(10000);  
  thx->loop(); // this is crucial, call loop() from time to time to receive MQTT callback
}
