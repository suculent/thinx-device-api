#include <Arduino.h>

#define __DEBUG__
#define __DEBUG_JSON__

#define __USE_WIFI_MANAGER__

#include <stdio.h>
#include "ArduinoJson/ArduinoJson.h"

#include <FS.h>

// Inject SSID and Password from 'Settings.h' for testing where we do not use EAVManager
#ifndef __USE_WIFI_MANAGER__
#include "Settings.h"
#else
// Custom clone of EAVManager (we shall revert back to OpenSource if this won't be needed)
// Purpose: SSID/password injection in AP mode
// Solution: re-implement from UDP in mobile application
//
// Changes so far: `int connectWifi()` moved to public section in header
// - buildable, but requires UDP end-to-end)
#include "EAVManager/EAVManager.h"
#include <EAVManager.h>
#endif

// Using better than Arduino-bundled version of MQTT https://github.com/Imroy/pubsubclient
#include "PubSubClient/PubSubClient.h" // Local checkout
//#include <PubSubClient.h> // Arduino Library

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266httpUpdate.h>

#define MQTT_BUFFER_SIZE 512

class THiNX {

  public:

    // Public API
    void initWithAPIKey(String);
    void publish();
    void loop();

    // Internal public API
    String thx_connected_response = "{ \"status\" : \"connected\" }";
    String thx_disconnected_response = "{ \"status\" : \"disconnected\" }";

    THiNX(String);
    THiNX();

    // WiFi Client
    EAVManager *manager;
    EAVManagerParameter *api_key_param;

    // THiNX Client
    // Import build-time values from thinx.h
    String thinx_commit_id;
    String thinx_mqtt_url;
    String thinx_cloud_url;
    String thinx_firmware_version;
    String thinx_firmware_version_short;
    String app_version;

    int thinx_mqtt_port;
    int thinx_api_port;

    // dynamic variables
    String thinx_alias;
    String thinx_owner;
    String thinx_udid;
    String thinx_api_key;

    // MQTT

    PubSubClient *mqtt_client;

    uint8_t buf[MQTT_BUFFER_SIZE];

    void receive_ota(const MQTT::Publish& pub) {
      Serial.println("*TH: MQTT update...");
      uint32_t startTime = millis();
      uint32_t size = pub.payload_len();
      if (size == 0)
        return;

      Serial.print("Receiving OTA of ");
      Serial.print(size);
      Serial.println(" bytes...");

      Serial.setDebugOutput(true);
      if (ESP.updateSketch(*pub.payload_stream(), size, true, false)) {
        Serial.println("Clearing retained message.");
        THiNX::mqtt_client->publish(MQTT::Publish(pub.topic(), "").set_retain());
        THiNX::mqtt_client->disconnect();

        Serial.printf("Update Success: %u\nRebooting...\n", millis() - startTime);
        ESP.restart();
        delay(10000);
      }

      Update.printError(Serial);
      Serial.setDebugOutput(false);
    }

    inline void mqtt_callback(const MQTT::Publish& pub) {
      Serial.println("*TH: MQTT callback...");
      if (pub.has_stream()) {
        Serial.print(pub.topic());
        Serial.print(" => ");
        if (pub.has_stream()) {
          uint8_t buf[MQTT_BUFFER_SIZE];
          int read;
          while (read = pub.payload_stream()->read(buf, MQTT_BUFFER_SIZE)) {
            // Do something with data in buffer
            Serial.write(buf, read);
          }
          pub.payload_stream()->stop();
          Serial.println("stop.");
        } else {
          Serial.println(pub.payload_string());
        }
      }
    }

    String thinx_mqtt_channel();

    private:

      // WiFi Manager
      WiFiClient *thx_wifi_client;
      const char* autoconf_ssid; // SSID in AP mode
      const char* autoconf_pwd; // fallback password, logged to console
      int status;                 // global WiFi status
      bool once;
      bool connected;
      //void configModeCallback(EAVManager*);
      void saveConfigCallback();

      // THiNX API
      char thx_api_key[64];     // new firmware requires 64 bytes
      char thx_udid[64];        // new firmware requires 64 bytes

      StaticJsonBuffer<1024> jsonBuffer;
      StaticJsonBuffer<2048> wrapperBuffer;

      void checkin();
      void senddata(String);
      void thinx_parse(String);
      void connect();
      void esp_update(String);

      // MQTT
      int last_mqtt_reconnect;
      bool start_mqtt();
      bool mqtt_result;

      String thinx_mqtt_shared_channel();
      String thinx_mac();

      // Data Storage
      bool shouldSaveConfig;

      bool restoreDeviceInfo();
      void saveDeviceInfo();
      String deviceInfo();
};
