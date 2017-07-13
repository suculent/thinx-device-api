/* OTA enabled firmware for Wemos D1 (ESP 8266, Arduino) */

#include "Arduino.h"

#include "Thinx.h"
#include "./thinx-lib-esp8266-arduinoc/src/thinx-lib-esp.h"

#define __DEBUG_WIFI__ /* use as fallback when device gets stucked with incorrect WiFi configuration, overwrites Flash in ESP */

THiNX* thx = NULL;

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.printf("Sketch size: %u\n", ESP.getSketchSize());
  Serial.printf("Free size: %u\n", ESP.getFreeSketchSpace());
  Serial.setDebugOutput(true);

#ifdef __DEBUG_WIFI__
  WiFi.begin("HAVANA", "1234567890");
#endif

  thx = new THiNX(thinx_api_key); // why do we have to call it all over? MQTT callback should be optinally set from here...
  Serial.println("Setup completed.");
}

void loop()
{
  delay(10000);  
  thx->loop(); // check MQTT status, reconnect, etc.
}
