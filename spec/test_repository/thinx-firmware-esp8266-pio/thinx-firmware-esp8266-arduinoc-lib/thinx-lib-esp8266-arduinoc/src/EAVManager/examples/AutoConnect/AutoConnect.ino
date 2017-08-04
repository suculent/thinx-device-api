#include <ESP8266WiFi.h>          //https://github.com/esp8266/Arduino

//needed for library
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <EAVManager.h>         //https://github.com/tzapu/EAVManager


void setup() {
    // put your setup code here, to run once:
    Serial.begin(115200);

    //EAVManager
    //Local intialization. Once its business is done, there is no need to keep it around
    EAVManager EAVManager;
    //reset saved settings
    //EAVManager.resetSettings();
    
    //set custom ip for portal
    //EAVManager.setAPConfig(IPAddress(10,0,1,1), IPAddress(10,0,1,1), IPAddress(255,255,255,0));

    //fetches ssid and pass from eeprom and tries to connect
    //if it does not connect it starts an access point with the specified name
    //here  "AutoConnectAP"
    //and goes into a blocking loop awaiting configuration
    EAVManager.autoConnect("AutoConnectAP");
    //or use this for auto generated name ESP + ChipID
    //EAVManager.autoConnect();

    
    //if you get here you have connected to the WiFi
    Serial.println("connected...yeey :)");
}

void loop() {
    // put your main code here, to run repeatedly:
    
}
