#include <FS.h>                   //this needs to be first, or it all crashes and burns...

#include <ESP8266WiFi.h>          //https://github.com/esp8266/Arduino

//needed for library
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <EAVManager.h>          //https://github.com/tzapu/EAVManager

void setup() {
  // put your setup code here, to run once:
  Serial.begin(115200);
  Serial.println();

  //EAVManager
  //Local intialization. Once its business is done, there is no need to keep it around
  EAVManager EAVManager;

  //exit after config instead of connecting
  EAVManager.setBreakAfterConfig(true);

  //reset settings - for testing
  //EAVManager.resetSettings();


  //tries to connect to last known settings
  //if it does not connect it starts an access point with the specified name
  //here  "AutoConnectAP" with password "password"
  //and goes into a blocking loop awaiting configuration
  if (!EAVManager.autoConnect("AutoConnectAP", "password")) {
    Serial.println("failed to connect, we should reset as see if it connects");
    delay(3000);
    ESP.reset();
    delay(5000);
  }

  //if you get here you have connected to the WiFi
  Serial.println("connected...yeey :)");


  Serial.println("local ip");
  Serial.println(WiFi.localIP());
}

void loop() {
  // put your main code here, to run repeatedly:


}
