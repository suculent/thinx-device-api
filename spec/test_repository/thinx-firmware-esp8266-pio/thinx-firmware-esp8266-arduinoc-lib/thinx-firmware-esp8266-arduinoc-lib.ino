/* OTA enabled firmware for Wemos D1 (ESP 8266, Arduino) */

#include "Arduino.h"
#include "Settings.h"
#include "./thinx-lib-esp8266-arduinoc/src/thinx-lib-esp.h"

#define __DEBUG_WIFI__ /* use as fallback when device gets stucked with incorrect WiFi configuration, overwrites Flash in ESP */

THiNX* thx = NULL;

void setup() {
  Serial.begin(115200);

#ifdef __DEBUG__
  while (!Serial);
#else
  delay(500);
#endif

  thx = new THiNX("71679ca646c63d234e957e37e4f4069bf4eed14afca4569a0c74abf503076732"); // why do we have to call it all over? MQTT callback should be optinally set from here...
  Serial.println("Setup completed.");
}

void loop()
{
  delay(10000);
  thx->loop(); // check MQTT status, reconnect, etc.
  Serial.printf("Free size: %u\n", ESP.getFreeSketchSpace());
}
