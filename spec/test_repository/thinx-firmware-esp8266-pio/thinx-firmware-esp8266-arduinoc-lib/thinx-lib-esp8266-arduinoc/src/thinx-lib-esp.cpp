#include "thinx-lib-esp.h"
#include "thinx.h"

extern "C" {
  #include "user_interface.h"
}

String THiNX::thinx_mqtt_channel() {
  return String("/") + thinx_owner + "/" + thinx_udid;
}

String THiNX::thinx_mqtt_status_channel() {
  return String("/") + thinx_owner + "/" + thinx_udid + "/status";
}

String THiNX::thinx_mac() {
  byte mac[] = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  };
  WiFi.macAddress(mac);
  char macString[16] = {0};
  sprintf(macString, "5CCF7F%6X", ESP.getChipId());
  return String(macString);
}

THiNX::THiNX() {
  // We could init from SPIFFS directly but it is initially empty anyway
  // and otherwise it could cause a lot of distraction.
  available_update_url = null;
}

/*
 * Connection
 */

 void THiNX::connect() { // should return status bool
   thx_wifi_client = new WiFiClient();
   manager = new EAVManager();

   EAVManagerParameter *api_key_param = new EAVManagerParameter("apikey", "API Key", thx_api_key, 64);
   manager->addParameter(api_key_param);
   manager->setTimeout(10000);
   manager->autoConnect(autoconf_ssid,autoconf_pwd);

   while ( !connected ) {
     status = manager->autoConnect(autoconf_ssid,autoconf_pwd);
     if (status == true) {
       connected = true;
       return;
     } else {
       Serial.print("*TH: Connection Status: false!");
       delay(3000);
       connected = false;
     }
   }
 }

 void THiNX::checkin() {
   Serial.println("*TH: Starting API checkin...");
   if(!connected) {
     Serial.println("*TH: Cannot checkin while not connected, exiting.");
   } else {
     String body = checkin_body();
     senddata(body);
   }
 }

 String THiNX::checkin_body() {

   Serial.println("*TH: Building request...");

   restore_device_info();

   String tmac = thinx_mac();
   String fw = thinx_firmware_version;
   String fws = thinx_firmware_version_short;
   String cid = String(thinx_commit_id);
   String oid = thinx_owner;
   String als = thinx_alias;
   String uid = thinx_udid;
   Serial.print("UDID:");
   Serial.println(thinx_udid);

   JsonObject& root = jsonBuffer.createObject();
   root["mac"] = thinx_mac();
   root["firmware"] = thinx_firmware_version;
   root["version"] = thinx_firmware_version_short;
   root["commit"] = thinx_commit_id;
   root["owner"] = thinx_owner;
   root["alias"] = thinx_alias;

   if (thinx_udid != NULL) {
     root["udid"] = thinx_udid;
   }

   root["platform"] = String(THINX_PLATFORM);

   Serial.println("*TH: Wrapping request...");

   JsonObject& wrapper = wrapperBuffer.createObject();
   wrapper["registration"] = root;

 #ifdef __DEBUG_JSON__
   wrapper.printTo(Serial);
   Serial.println();
 #endif

   String body;
   wrapper.printTo(body);
   return body;
 }

void THiNX::senddata(String body) {
  char shorthost[256] = {0};
  sprintf(shorthost, "%s", thinx_cloud_url.c_str());
  String payload = "";
  if (thx_wifi_client->connect(shorthost, 7442)) {
    // Standard public THiNX-Client device registration request
    // (same request can be called in order to add matching mobile application push token)
    thx_wifi_client->println("POST /device/register HTTP/1.1");
    thx_wifi_client->println("Host: thinx.cloud");
    thx_wifi_client->print("Authentication: "); thx_wifi_client->println(thx_api_key);
    thx_wifi_client->println("Accept: application/json"); // application/json
    thx_wifi_client->println("Origin: device");
    thx_wifi_client->println("Content-Type: application/json");
    thx_wifi_client->println("User-Agent: THiNX-Client");
    thx_wifi_client->print("Content-Length: ");
    thx_wifi_client->println(body.length());
    thx_wifi_client->println();
    Serial.println("Headers set...");
    thx_wifi_client->println(body);
    Serial.println("Body sent...");

    long interval = 10000;
    unsigned long currentMillis = millis(), previousMillis = millis();

    while(!thx_wifi_client->available()){
      if( (currentMillis - previousMillis) > interval ){
        Serial.println("Response Timeout. TODO: Should retry later.");
        thx_wifi_client->stop();
        return;
      }
      currentMillis = millis();
    }

    while ( thx_wifi_client->connected() ) {
      if ( thx_wifi_client->available() ) {
        char str = thx_wifi_client->read();
        payload = payload + String(str);
      }
    }

    thx_wifi_client->stop();
    parse(payload);

  } else {
    Serial.println("*TH: API connection failed.");
    return;
  }
}

/*
 * Response Parser
 */

void THiNX::parse(String payload) {

  // TODO: Should parse response only for this device_id (which must be internal and not a mac)

  payload_type ptype = Unknown;

  int startIndex = 0;
  int endIndex = payload.length();

  int reg_index = payload.indexOf("{\"registration\"");
  int upd_index = payload.indexOf("{\"update\"");
  int not_index = payload.indexOf("{\"notification\"");

  if (upd_index > startIndex) {
    startIndex = upd_index;
    ptype = UPDATE;
  }

  if (reg_index > startIndex) {
    startIndex = reg_index;
    endIndex = payload.indexOf("}}") + 2;
    ptype = REGISTRATION;
  }

  if (not_index > startIndex) {
    startIndex = not_index;
    endIndex = payload.indexOf("}}") + 2; // is this still needed?
    ptype = NOTIFICATION;
  }

  String body = payload.substring(startIndex, endIndex);

#ifdef __DEBUG__
    Serial.print("*TH: Parsing response: '");
    Serial.print(body);
    Serial.println("'");
#endif

  JsonObject& root = jsonBuffer.parseObject(body.c_str());

  if ( !root.success() ) {
  Serial.println("Failed parsing root node.");
    return;
  }

  switch (ptype) {

    case UPDATE: {

      JsonObject& update = root["update"];
      Serial.println("TODO: Parse update payload...");

      // Parse update (work in progress)
      String mac = update["mac"];
      Serial.println(String("mac: ") + mac);

      if (mac != thinx_mac()) {
        Serial.println("*TH: Warning: firmware is dedicated to device with different MAC.");
      }

      // Check current firmware based on commit id and store Updated state...
      String commit = update["commit"];
      Serial.println(String("commit: ") + commit);

      // Check current firmware based on version and store Updated state...
      String version = update["version"];
      Serial.println(String("version: ") + version);

      if ((commit == thinx_commit_id) && (version == thinx_version_id)) {
        if (strlen(available_update_url) > 5) {
          Serial.println("*TH: firmware has same commit_id as current and update availability is stored. Firmware has been installed.");
          available_update_url = "";
          save_device_info();
          notify_on_successful_update();
          return;
        } else {
          Serial.println("*TH: Info: firmware has same commit_id as current and no update is available.");
        }
      }

      // In case automatic updates are disabled,
      // we must ask user to commence firmware update.
      if (THINX_AUTO_UPDATE == false) {
        if (mqtt_client) {
          mqtt_client->publish(
            thinx_mqtt_channel().c_str(),
            thx_update_question.c_str()
          );
        }

      } else {

        Serial.println("Starting update...");

        // FROM LUA: update variants
        // local files = payload['files']
        // local ott   = payload['ott']
        // local url   = payload['url']
        // local type  = payload['type']

        String url = update["url"]; // may be OTT URL
        available_update_url = url;
        save_device_info();
        if (url) {
          Serial.println("*TH: Force update URL must not contain HTTP!!! :" + url);
          url = url.replace("http://", "");
          // TODO: must not contain HTTP, extend with http://thinx.cloud/"
          // TODO: Replace thinx.cloud with thinx.local in case proxy is available
          update_and_reboot(url);
        }
        return;
      }

    } break;

    case NOTIFICATION: {

      // Currently, this is used for update only, can be extended with request_category or similar.
      JsonObject& notification = root["notification"];

      if ( !notification.success() ) {
        Serial.println("Failed parsing notification node.");
        return;
      }

      String type = notification["response_type"];
      if ((type == "bool") || (type == "boolean")) {
        bool response = notification["response"];
        if (response == true) {
          Serial.println("User allowed update using boolean.");
          if (strlen(available_update_url) > 0) {
            update_and_reboot(available_update_url);
          }
        } else {
          Serial.println("User denied update using boolean.");
        }
      }

      if ((type == "string") || (type == "String")) {
        String response = notification["response"];
        if (response == "yes") {
          Serial.println("User allowed update using string.");
          if (strlen(available_update_url) > 0) {
            update_and_reboot(available_update_url);
          }
        } else if (response == "no") {
          Serial.println("User denied update using string.");
        }
      }

    } break;

    case REGISTRATION: {

      JsonObject& registration = root["registration"];

      if ( !registration.success() ) {
        Serial.println("Failed parsing registration node.");
        return;
      }

      bool success = registration["success"];
      String status = registration["status"];

      if (status == "OK") {

        String alias = registration["alias"];
        Serial.print("Reading alias: ");
        Serial.print(alias);
        if ( alias.length() > 0 ) {
          Serial.println(String("assigning alias: ") + alias);
          thinx_alias = alias;
        }

        String owner = registration["owner"];
        Serial.println("Reading owner: ");
        if ( owner.length() > 0 ) {
          Serial.println(String("assigning owner: ") + owner);
          thinx_owner = owner;
        }

        Serial.println("Reading udid: ");
        String udid = registration["udid"];
        if ( udid.length() > 0 ) {
          Serial.println(String("assigning udid: ") + udid);
          thinx_udid = udid;
        }

        // Check current firmware based on commit id and store Updated state...
        String commit = registration["commit"];
        Serial.println(String("commit: ") + commit);

        // Check current firmware based on version and store Updated state...
        String version = registration["version"];
        Serial.println(String("version: ") + version);

        if ((commit == thinx_commit_id) && (version == thinx_version_id)) {
          if (strlen(available_update_url) > 5) {
            Serial.println("*TH: firmware has same commit_id as current and update availability is stored. Firmware has been installed.");
            available_update_url = "";
            save_device_info();
            notify_on_successful_update();
            return;
          } else {
            Serial.println("*TH: Info: firmware has same commit_id as current and no update is available.");
          }
        }

        delay(1);
        save_device_info();

      } else if (status == "FIRMWARE_UPDATE") {

        String mac = registration["mac"];
        Serial.println(String("mac: ") + mac);
        // TODO: must be current or 'ANY'

        String commit = registration["commit"];
        Serial.println(String("commit: ") + commit);

        // should not be same except for forced update
        if (commit == thinx_commit_id) {
          Serial.println("*TH: Warning: new firmware has same commit_id as current.");
        }

        String version = registration["version"];
        Serial.println(String("version: ") + version);

        Serial.println("Starting update...");

        String url = registration["url"];
        if (url) {
          Serial.println("*TH: Running update with URL that should not contain http! :" + url);
          url = url.replace("http://", "");
          update_and_reboot(url);
        }
      }

      } break;

    default:
      Serial.println("Nothing to do...");
      break;
  }

}

/*
 * MQTT
 */

void THiNX::publish() {
  if (mqtt_client == NULL) return;
  if (thinx_udid.length() == 0) return;
  restore_device_info(); // thinx_mqtt_status_channel() requires owner and uuid
  String channel = thinx_mqtt_status_channel();
  if (mqtt_client->connected()) {
    Serial.println("*TH: MQTT connected...");
    mqtt_client->publish(channel.c_str(), thx_connected_response.c_str());
    mqtt_client->loop();
  } else {
    Serial.println("*TH: MQTT not connected, reconnecting...");
    mqtt_result = start_mqtt();
    if (mqtt_result && mqtt_client->connected()) {
      mqtt_client->publish(channel.c_str(), thx_connected_response.c_str());
      Serial.println("*TH: MQTT reconnected, published default message.");
    } else {
      Serial.println("*TH: MQTT Reconnect failed...");
    }
  }
}

void THiNX::notify_on_successful_update() {
  if (mqtt_client) {
    String *success = "{ title: \"Update Successful\", body: \"The device has been successfully updated.\", type: \"success\" }";
    mqtt_client->publish(
      thinx_mqtt_status_channel().c_str(),
      success.c_str()
    );
  } else {
    Serial.println("Device updated but MQTT not active to notify. TODO: Store.");
  }
}

/*
void THiNX::parse_registration(JSONObject &root) {


}

void THiNX::parse_update(JSONObject &root) {

}
*/

bool THiNX::start_mqtt() {

  if (thinx_udid.length() == 0) {
    return false;
  }

  Serial.print("*TH: UDID: ");
  Serial.println(thinx_udid);

  Serial.print("*TH: Contacting MQTT server ");
  Serial.println(thinx_mqtt_url);

  //PubSubClient mqtt_client(thx_wifi_client, thinx_mqtt_url.c_str());
  Serial.print("*TH: Starting client");
  if (mqtt_client == NULL) {
    mqtt_client = new PubSubClient(*thx_wifi_client, thinx_mqtt_url.c_str());
  }

  Serial.print(" on port ");
  Serial.println(thinx_mqtt_port);

  last_mqtt_reconnect = 0;

  String channel = thinx_mqtt_channel();
  Serial.println("*TH: Connecting to MQTT...");


  Serial.print("*TH: AK: ");
  Serial.println(thinx_api_key);
  Serial.print("*TH: DCH: ");
  Serial.println(channel);

  String mac = thinx_mac();

  const char* id = mac.c_str();
  const char* user = thinx_udid.c_str();
  const char* pass = thinx_api_key.c_str();
  const char* willTopic = thinx_mqtt_channel().c_str();
  int willQos = 0;
  bool willRetain = false;

  if (mqtt_client->connect(MQTT::Connect(id)
                .set_will(willTopic, thx_disconnected_response.c_str())
                .set_auth(user, pass)
                .set_keepalive(30)
              )) {

      mqtt_client->set_callback([this](const MQTT::Publish &pub){

        Serial.println("*TH: MQTT callback...");
        Serial.print(pub.topic());
        Serial.print(" => ");

        if (pub.has_stream()) {
          Serial.println("*TH: MQTT Type: Stream...");
          Serial.setDebugOutput(true);
          uint32_t startTime = millis();
          uint32_t size = pub.payload_len();
          if ( ESP.updateSketch(*pub.payload_stream(), size, true, false) ) {

            // Notify on reboot for update
            mqtt_client->publish(
              thinx_mqtt_status_channel().c_str(),
              thx_reboot_response.c_str()
            );
            mqtt_client->disconnect();
            pub.payload_stream()->stop();
            Serial.printf("Update Success: %u\nRebooting...\n", millis() - startTime);
            ESP.restart();
            delay(10000);
          }

          Serial.println("stop.");

        } else {

          Serial.println("*TH: MQTT Type: String or JSON...");
          String payload = pub.payload_string();
          Serial.println(payload);
          parse(payload);

        }
    }); // end-of-callback

    Serial.print("*TH: MQTT Subscribing device channel: ");
    Serial.println(thinx_mqtt_channel());

    if (mqtt_client->subscribe(thinx_mqtt_channel().c_str())) {
      Serial.print("*TH: ");
      Serial.print(thinx_mqtt_channel());
      Serial.println(" successfully subscribed.");

      // Publish status on status channel
      mqtt_client->publish(
        thinx_mqtt_status_channel().c_str(),
        thx_connected_response.c_str()
      );

      // Publish registration on status channel to request possible update
      mqtt_client->publish(
        thinx_mqtt_status_channel().c_str(),
        checkin_body().c_str()
      );

      return true;
  } else {
    Serial.println("*TH: MQTT Not connected.");
    return false;
  }
}
}

//
// EAVManager Setup Callbacks
//


// `api_key_param` should have its value set when this gets called
// ICACHE_FLASH_ATTR
void THiNX::saveConfigCallback() {
  Serial.println("Saveing configuration...");
  strcpy(thx_api_key, api_key_param->getValue());
  if (String(thx_api_key).length() > 0) {
    thinx_api_key = String(thx_api_key);
    Serial.print("Saving thinx_api_key: ");
    Serial.println(thinx_api_key);
    save_device_info();
  }
}

/*
 * Device Info
 */

 bool THiNX::restore_device_info() {

   File f = SPIFFS.open("/thx.cfg", "r");
   if (!f) {
       Serial.println("*TH: No remote configuration found so far...");
       return false;
   } else {
     String data = f.readStringUntil('\n');
     JsonObject& config = jsonBuffer.parseObject(data.c_str());
     if (!config.success()) {
       Serial.println("*TH: parseObject() failed");
     } else {

       const char* saved_alias = config["alias"];
       if (strlen(saved_alias) > 1) {
         thinx_alias = String(saved_alias);
       }

       const char* saved_owner = config["owner"];
       if (strlen(saved_owner) > 5) {
         thinx_owner = String(saved_owner);
       }

       const char* saved_apikey = config["apikey"];
       if (strlen(saved_apikey) > 8) {
        thinx_api_key = String(saved_apikey);
        sprintf(thx_api_key, "%s", saved_apikey); // 40 max
       }

       const char* saved_update = config["update"];
       if (strlen(saved_update) > 5) {
         available_update_url = String(saved_update);
         sprintf(available_update_url, "%s", saved_update);
       }

       const char* saved_udid = config["udid"];
       Serial.print("*TH: Saved udid: "); Serial.println(saved_udid);
       if ((strlen(saved_udid) > 1)) {
        thinx_udid = String(saved_udid);
      } else {
        thinx_udid = THINX_UDID;
      }
      sprintf(thx_udid, "%s", thinx_udid.c_str()); // 40 max

      f.close();
     }
   }
 }

 /* Stores mutable device data (alias, owner) retrieved from API */
 void THiNX::save_device_info()
 {
   const char *config = deviceInfo().c_str();

   File f = SPIFFS.open("/thx.cfg", "w");
   if (f) {
     Serial.print("*TH: saving configuration...");
     f.close();
   } else {
     Serial.println("*TH: Cannot save configuration, formatting SPIFFS...");
     SPIFFS.format();
     Serial.println("*TH: Trying to save again...");
     f = SPIFFS.open("/thx.cfg", "w");
     if (f) {
       save_device_info();
       f.close();
     } else {
       Serial.println("*TH: Retry failed...");
     }
   }

   Serial.println("*TH: save_device_info() completed.");
   SPIFFS.end();
   Serial.println("*TH: SPIFFS.end();");

   restore_device_info();
 }

String THiNX::deviceInfo()
{
  Serial.println("*TH: building device info:");
  JsonObject& root = jsonBuffer.createObject();
  root["alias"] = thinx_alias;
  Serial.print("*TH: thinx_alias: ");
  Serial.println(thinx_alias);

  root["owner"] = thinx_owner;
  Serial.print("*TH: thinx_owner: ");
  Serial.println(thinx_owner);

  root["apikey"] = thx_api_key;
  Serial.print("*TH: thx_api_key: ");
  Serial.println(thx_api_key);

  root["udid"] = thinx_udid;
  Serial.print("*TH: thinx_udid: ");
  Serial.println(thinx_udid);

  root["update"] = available_update_url;
  Serial.print("*TH: available_update_url: ");
  Serial.println(available_update_url);

  String jsonString;
  root.printTo(jsonString);

  return jsonString;
}


// do_mqtt
// process_mqtt()
// parse_registration(json)
// parse_update(json)

// notify_on_successful_update()
// send_update_question()

/*
 * Updates
 */

// update_file(name, data)
// update_from_url(name, url)

void THiNX::update_and_reboot(String url) {

#ifdef __DEBUG__
  Serial.println("[update] Starting update...");
#endif

// #define __USE_ESP__
#ifdef __USE_ESP__
  uint32_t size = pub.payload_len();
  if (ESP.updateSketch(*pub.payload_stream(), size, true, false)) {
    Serial.println("Clearing retained message.");
    mqtt_client->publish(MQTT::Publish(pub.topic(), "").set_retain());
    mqtt_client->disconnect();

    Serial.printf("Update Success: %u\nRebooting...\n", millis() - startTime);

    // Notify on reboot for update
    if (mqtt_client) {
      mqtt_client->publish(
        thinx_mqtt_status_channel().c_str(),
        thx_reboot_response.c_str()
      );
      mqtt_client->disconnect();
    }

    ESP.restart();
    delay(10000);
  }
#else

  t_httpUpdate_return ret = ESPhttpUpdate.update("thinx.cloud", 80, url.c_str());

  switch(ret) {
    case HTTP_UPDATE_FAILED:
    Serial.println("[update] Update failed.");
    break;
    case HTTP_UPDATE_NO_UPDATES:
    Serial.println("[update] Update no Update.");
    break;
    case HTTP_UPDATE_OK:
    Serial.println("[update] Update ok."); // may not called we reboot the ESP
    delay(1000);
    break;
  }

  if (ret != HTTP_UPDATE_OK) {
    Serial.println("[update] WiFi connected, trying advanced update...");
    Serial.println("[update] TODO: Rewrite to secure binary provider on the API side!");
    ret = ESPhttpUpdate.update("images.thinx.cloud", 80, "ota.php", "5ccf7fee90e0");
    switch(ret) {
      case HTTP_UPDATE_FAILED:
      Serial.println("[update] Update failed.");
      break;
      case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[update] Update no Update.");
      break;
      case HTTP_UPDATE_OK:
      Serial.println("[update] Update ok."); // may not called we reboot the ESP
      break;
    }
  }
#endif
}

/*
 * Core loop
 */

void THiNX::loop() {
  Serial.println(".");
  // uint32_t memfree = system_get_free_heap_size(); Serial.print("PRE-PUBLISH memfree: "); Serial.println(memfree);
  publish();
  //Serial.print("POST-PUBLISH memfree: "); memfree = system_get_free_heap_size(); Serial.println(memfree);
}

// Should use THINX_API_KEY from thinx.h
THiNX::THiNX(String __apikey) {
  thinx_api_key = __apikey;
  autoconf_ssid  = "AP-THiNX"; // SSID in AP mode
  autoconf_pwd   = "PASSWORD"; // fallback to default password, however this should be generated uniquely as it is logged to console
  thx_udid[64] = {0};
  status = WL_IDLE_STATUS;
  shouldSaveConfig = false;
  connected = false;
  once = true;
  mqtt_client = NULL;

  initWithAPIKey(thinx_api_key);
}

// Designated initializer
void THiNX::initWithAPIKey(String api_key) {

  // Import build-time values from thinx.h
  thinx_commit_id = String(THINX_COMMIT_ID);
  thinx_mqtt_url = String(THINX_MQTT_URL);
  thinx_cloud_url = String(THINX_CLOUD_URL);
  thinx_firmware_version = String(THINX_FIRMWARE_VERSION);
  thinx_firmware_version_short = String(THINX_FIRMWARE_VERSION_SHORT);
  app_version = String(THINX_APP_VERSION);

  thinx_mqtt_port = THINX_MQTT_PORT;
  thinx_api_port = THINX_API_PORT;

  // dynamic variables
  thinx_alias = String(THINX_ALIAS);
  thinx_owner = String(THINX_OWNER);
  thinx_udid = String(THINX_UDID);

  if (once == true) {
    once = false;
  } else {
     return;
  }

  if (api_key != "") {
    thinx_api_key = api_key;
    sprintf(thx_api_key, "%s", thinx_api_key.c_str()); // 40 max
  }

  Serial.println("*TH: Mounting SPIFFS...");
  bool result = SPIFFS.begin();
  delay(50);
  Serial.println("*TH: SPIFFS mounted: " + result);

  restore_device_info();

  Serial.println("*TH: Connecting...");

  connect();

#ifdef __DEBUG__
  if (connected) {
    Serial.println("*TH: Connected to WiFi...");
  } else {
    Serial.println("*TH: Connection to WiFi failed...");
  }
#endif

  //delay(5000);
  Serial.println("*TH: Checking in...");
  checkin();

  delay(1000);

  mqtt_result = start_mqtt(); // requires valid udid and api_keys, and allocated WiFiClient.

  if (mqtt_result == true) {
    Serial.println("*TH: Starting MQTT...");
  } else {
    Serial.println("*TH: MQTT delayed...");
  }

#ifdef __DEBUG__
  // test == our tenant name from THINX platform
  // Serial.println("[update] Trying direct update...");
  // update_and_reboot("/bin/test/firmware.elf");
#endif
}
