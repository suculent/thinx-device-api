#include <ESP8266WiFi.h>          //https://github.com/esp8266/Arduino

//needed for library
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include "EAVManager.h"          //https://github.com/tzapu/EAVManager

void configModeCallback (EAVManager *myEAVManager) {
  Serial.println("*TH: Entered Configuration Mode.");
  //Serial.print("     IP: ");
  //Serial.println(WiFi.softAPIP());
  //Serial.print("     SSID: ");
  //Serial.println(myEAVManager->getConfigPortalSSID());
}

void setup() {
  // put your setup code here, to run once:
  Serial.begin(115200);

  //EAVManager
  //Local intialization. Once its business is done, there is no need to keep it around
  EAVManager EAVManager;
  //reset settings - for testing
  //EAVManager.resetSettings();

  //set callback that gets called when connecting to previous WiFi fails, and enters Access Point mode
  EAVManager.setAPCallback(configModeCallback);

  //fetches ssid and pass and tries to connect
  //if it does not connect it starts an access point with the specified name
  //here  "AutoConnectAP"
  //and goes into a blocking loop awaiting configuration
  if(!EAVManager.autoConnect()) {
    Serial.println("failed to connect and hit timeout");
    //reset and try again, or maybe put it to deep sleep
    ESP.reset();
    delay(1000);
  }

  //if you get here you have connected to the WiFi
  Serial.println("connected...yeey :)");

}

void loop() {
  // put your main code here, to run repeatedly:

}
