/**************************************************************
   EAVManager is a library for the ESP8266/Arduino platform
   (https://github.com/esp8266/Arduino) to enable easy
   configuration and reconfiguration of WiFi credentials using a Captive Portal
   inspired by:
   http://www.esp8266.com/viewtopic.php?f=29&t=2520
   https://github.com/chriscook8/esp-arduino-apboot
   https://github.com/esp8266/Arduino/tree/esp8266/hardware/esp8266com/esp8266/libraries/DNSServer/examples/CaptivePortalAdvanced
   Built by AlexT https://github.com/tzapu
   Licensed under MIT license
 **************************************************************/

#include "EAVManager.h"

EAVManagerParameter::EAVManagerParameter(const char *custom) {
  _id = NULL;
  _placeholder = NULL;
  _length = 0;
  _value = NULL;

  _customHTML = custom;
}

EAVManagerParameter::EAVManagerParameter(const char *id, const char *placeholder, const char *defaultValue, int length) {
  init(id, placeholder, defaultValue, length, "");
}

EAVManagerParameter::EAVManagerParameter(const char *id, const char *placeholder, const char *defaultValue, int length, const char *custom) {
  init(id, placeholder, defaultValue, length, custom);
}

void EAVManagerParameter::init(const char *id, const char *placeholder, const char *defaultValue, int length, const char *custom) {
  _id = id;
  _placeholder = placeholder;
  _length = length;
  _value = new char[length + 1];
  for (int i = 0; i < length; i++) {
    _value[i] = 0;
  }
  if (defaultValue != NULL) {
    strncpy(_value, defaultValue, length);
  }

  _customHTML = custom;
}

const char* EAVManagerParameter::getValue() {
  return _value;
}
const char* EAVManagerParameter::getID() {
  return _id;
}
const char* EAVManagerParameter::getPlaceholder() {
  return _placeholder;
}
int EAVManagerParameter::getValueLength() {
  return _length;
}
const char* EAVManagerParameter::getCustomHTML() {
  return _customHTML;
}

EAVManager::EAVManager() {
}

void EAVManager::addParameter(EAVManagerParameter *p) {
  _params[_paramsCount] = p;
  _paramsCount++;
  DEBUG_WM("Adding parameter");
  DEBUG_WM(p->getID());
}

void EAVManager::setupConfigPortal() {
  dnsServer.reset(new DNSServer());
  server.reset(new ESP8266WebServer(80));

  DEBUG_WM(F(""));
  _configPortalStart = millis();

  DEBUG_WM(F("Configuring access point... "));
  DEBUG_WM(_apName);
  if (_apPassword != NULL) {
    if (strlen(_apPassword) < 8 || strlen(_apPassword) > 63) {
      // fail passphrase to short or long!
      DEBUG_WM(F("Invalid AccessPoint password. Ignoring"));
      _apPassword = NULL;
    }
    DEBUG_WM(_apPassword);
  }

  //optional soft ip config
  if (_ap_static_ip) {
    DEBUG_WM(F("Custom AP IP/GW/Subnet"));
    WiFi.softAPConfig(_ap_static_ip, _ap_static_gw, _ap_static_sn);
  }

  if (_apPassword != NULL) {
    WiFi.softAP(_apName, _apPassword);//password option
  } else {
    WiFi.softAP(_apName);
  }

  delay(500); // Without delay I've seen the IP address blank
  DEBUG_WM(F("AP IP address: "));
  DEBUG_WM(WiFi.softAPIP());

  /* Setup the DNS server redirecting all the domains to the apIP */
  dnsServer->setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer->start(DNS_PORT, "*", WiFi.softAPIP());

  /* Setup web pages: root, wifi config pages, SO captive portal detectors and not found. */
  server->on("/", std::bind(&EAVManager::handleRoot, this));
  server->on("/wifi", std::bind(&EAVManager::handleWifi, this, true));
  server->on("/0wifi", std::bind(&EAVManager::handleWifi, this, false));
  server->on("/wifisave", std::bind(&EAVManager::handleWifiSave, this));
  server->on("/i", std::bind(&EAVManager::handleInfo, this));
  server->on("/r", std::bind(&EAVManager::handleReset, this));
  //server->on("/generate_204", std::bind(&EAVManager::handle204, this));  //Android/Chrome OS captive portal check.
  server->on("/fwlink", std::bind(&EAVManager::handleRoot, this));  //Microsoft captive portal. Maybe not needed. Might be handled by notFound handler.
  server->onNotFound (std::bind(&EAVManager::handleNotFound, this));
  server->begin(); // Web server start
  DEBUG_WM(F("HTTP server started"));

}

boolean EAVManager::autoConnect() {
  String ssid = "ESP" + String(ESP.getChipId());
  return autoConnect(ssid.c_str(), NULL);
}

boolean EAVManager::autoConnect(char const *apName, char const *apPassword) {
  DEBUG_WM(F(""));
  DEBUG_WM(F("AutoConnect"));

  // read eeprom for ssid and pass
  //String ssid = getSSID();
  //String pass = getPassword();

  // attempt to connect; should it fail, fall back to AP
  WiFi.mode(WIFI_STA);

  if (connectWifi("", "") == WL_CONNECTED)   {
    DEBUG_WM(F("IP Address:"));
    DEBUG_WM(WiFi.localIP());
    //connected
    return true;
  }

  return startConfigPortal(apName, apPassword);
}

boolean EAVManager::startConfigPortal() {
  String ssid = "ESP" + String(ESP.getChipId());
  return startConfigPortal(ssid.c_str(), NULL);
}

boolean  EAVManager::startConfigPortal(char const *apName, char const *apPassword) {
  //setup AP
  WiFi.mode(WIFI_AP_STA);
  DEBUG_WM("SET AP STA");

  _apName = apName;
  _apPassword = apPassword;

  //notify we entered AP mode
  if ( _apcallback != NULL) {
    _apcallback(this);
  }

  connect = false;
  setupConfigPortal();

  while (_configPortalTimeout == 0 || millis() < _configPortalStart + _configPortalTimeout) {
    //DNS
    dnsServer->processNextRequest();
    //HTTP
    server->handleClient();


    if (connect) {
      connect = false;
      delay(2000);
      DEBUG_WM(F("Connecting to new AP"));

      // using user-provided  _ssid, _pass in place of system-stored ssid and pass
      if (connectWifi(_ssid, _pass) != WL_CONNECTED) {
        DEBUG_WM(F("Failed to connect."));
      } else {
        //connected
        WiFi.mode(WIFI_STA);
        //notify that configuration has changed and any optional parameters should be saved
        if ( _savecallback != NULL) {
          //todo: check if any custom parameters actually exist, and check if they really changed maybe
          _savecallback();
        }
        break;
      }

      if (_shouldBreakAfterConfig) {
        //flag set to exit after config after trying to connect
        //notify that configuration has changed and any optional parameters should be saved
        if ( _savecallback != NULL) {
          //todo: check if any custom parameters actually exist, and check if they really changed maybe
          _savecallback();
        }
        break;
      }
    }
    yield();
  }

  server.reset();
  dnsServer.reset();

  return  WiFi.status() == WL_CONNECTED;
}


int EAVManager::connectWifi(String ssid, String pass) {
  DEBUG_WM(F("Connecting as wifi client..."));

  // check if we've got static_ip settings, if we do, use those.
  if (_sta_static_ip) {
    DEBUG_WM(F("Custom STA IP/GW/Subnet"));
    WiFi.config(_sta_static_ip, _sta_static_gw, _sta_static_sn);
    DEBUG_WM(WiFi.localIP());
  }
  //fix for auto connect racing issue
  if (WiFi.status() == WL_CONNECTED) {
    DEBUG_WM("Already connected.");
    return WL_CONNECTED;
  }
  //check if we have ssid and pass and force those, if not, try with last saved values
  if (ssid != "") {
    WiFi.begin(ssid.c_str(), pass.c_str());
  } else {
    if (WiFi.SSID()) {
      DEBUG_WM("Using credentials stored to EEPROM");
      //trying to fix connection in progress hanging
      ETS_UART_INTR_DISABLE();
      wifi_station_disconnect();
      ETS_UART_INTR_ENABLE();

      WiFi.begin();
    } else {
      DEBUG_WM("No saved credentials");
    }
  }

  int connRes = waitForConnectResult();
  DEBUG_WM ("Connection result: ");
  DEBUG_WM ( connRes );
  //not connected, WPS enabled, no pass - first attempt
  if (_tryWPS && connRes != WL_CONNECTED && pass == "") {
    startWPS();
    //should be connected at the end of WPS
    connRes = waitForConnectResult();
  }
  return connRes;
}

uint8_t EAVManager::waitForConnectResult() {
  if (_connectTimeout == 0) {
    return WiFi.waitForConnectResult();
  } else {
    DEBUG_WM (F("Waiting for connection result with time out"));
    unsigned long start = millis();
    boolean keepConnecting = true;
    uint8_t status;
    while (keepConnecting) {
      status = WiFi.status();
      if (millis() > start + _connectTimeout) {
        keepConnecting = false;
        DEBUG_WM (F("Connection timed out"));
      }
      if (status == WL_CONNECTED || status == WL_CONNECT_FAILED) {
        keepConnecting = false;
      }
      delay(100);
    }
    return status;
  }
}

void EAVManager::startWPS() {
  DEBUG_WM("START WPS");
  WiFi.beginWPSConfig();
  DEBUG_WM("END WPS");
}
/*
  String EAVManager::getSSID() {
  if (_ssid == "") {
    DEBUG_WM(F("Reading SSID"));
    _ssid = WiFi.SSID();
    DEBUG_WM(F("SSID: "));
    DEBUG_WM(_ssid);
  }
  return _ssid;
  }

  String EAVManager::getPassword() {
  if (_pass == "") {
    DEBUG_WM(F("Reading Password"));
    _pass = WiFi.psk();
    DEBUG_WM("Password: " + _pass);
    //DEBUG_WM(_pass);
  }
  return _pass;
  }
*/
String EAVManager::getConfigPortalSSID() {
  return _apName;
}

void EAVManager::resetSettings() {
  DEBUG_WM(F("settings invalidated"));
  DEBUG_WM(F("THIS MAY CAUSE AP NOT TO START UP PROPERLY. YOU NEED TO COMMENT IT OUT AFTER ERASING THE DATA."));
  WiFi.disconnect(true);
  //delay(200);
}
void EAVManager::setTimeout(unsigned long seconds) {
  setConfigPortalTimeout(seconds);
}

void EAVManager::setConfigPortalTimeout(unsigned long seconds) {
  _configPortalTimeout = seconds * 1000;
}

void EAVManager::setConnectTimeout(unsigned long seconds) {
  _connectTimeout = seconds * 1000;
}

void EAVManager::setDebugOutput(boolean debug) {
  _debug = debug;
}

void EAVManager::setAPStaticIPConfig(IPAddress ip, IPAddress gw, IPAddress sn) {
  _ap_static_ip = ip;
  _ap_static_gw = gw;
  _ap_static_sn = sn;
}

void EAVManager::setSTAStaticIPConfig(IPAddress ip, IPAddress gw, IPAddress sn) {
  _sta_static_ip = ip;
  _sta_static_gw = gw;
  _sta_static_sn = sn;
}

void EAVManager::setMinimumSignalQuality(int quality) {
  _minimumQuality = quality;
}

void EAVManager::setBreakAfterConfig(boolean shouldBreak) {
  _shouldBreakAfterConfig = shouldBreak;
}

/** Handle root or redirect to captive portal */
void EAVManager::handleRoot() {
  DEBUG_WM(F("Handle root"));
  if (captivePortal()) { // If caprive portal redirect instead of displaying the page.
    return;
  }

  String page = FPSTR(HTTP_HEAD);
  page.replace("{v}", "Options");
  page += FPSTR(HTTP_SCRIPT);
  page += FPSTR(HTTP_STYLE);
  page += _customHeadElement;
  page += FPSTR(HTTP_HEAD_END);
  page += "<h1>";
  page += _apName;
  page += "</h1>";
  page += F("<h3>EAVManager</h3>");
  page += FPSTR(HTTP_PORTAL_OPTIONS);
  page += FPSTR(HTTP_END);

  server->send(200, "text/html", page);

}

/** Wifi config page handler */
void EAVManager::handleWifi(boolean scan) {

  String page = FPSTR(HTTP_HEAD);
  page.replace("{v}", "Config EAV");
  page += FPSTR(HTTP_SCRIPT);
  page += FPSTR(HTTP_STYLE);
  page += _customHeadElement;
  page += FPSTR(HTTP_HEAD_END);

  if (scan) {
    int n = WiFi.scanNetworks();
    DEBUG_WM(F("Scan done"));
    if (n == 0) {
      DEBUG_WM(F("No networks found"));
      page += F("No networks found. Refresh to scan again.");
    } else {

      //sort networks
      int indices[n];
      for (int i = 0; i < n; i++) {
        indices[i] = i;
      }

      // RSSI SORT

      // old sort
      for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
          if (WiFi.RSSI(indices[j]) > WiFi.RSSI(indices[i])) {
            std::swap(indices[i], indices[j]);
          }
        }
      }

      /*std::sort(indices, indices + n, [](const int & a, const int & b) -> bool
        {
        return WiFi.RSSI(a) > WiFi.RSSI(b);
        });*/

      // remove duplicates ( must be RSSI sorted )
      if (_removeDuplicateAPs) {
        String cssid;
        for (int i = 0; i < n; i++) {
          if (indices[i] == -1) continue;
          cssid = WiFi.SSID(indices[i]);
          for (int j = i + 1; j < n; j++) {
            if (cssid == WiFi.SSID(indices[j])) {
              DEBUG_WM("DUP AP: " + WiFi.SSID(indices[j]));
              indices[j] = -1; // set dup aps to index -1
            }
          }
        }
      }

      //display networks in page
      for (int i = 0; i < n; i++) {
        if (indices[i] == -1) continue; // skip dups
        DEBUG_WM(WiFi.SSID(indices[i]));
        DEBUG_WM(WiFi.RSSI(indices[i]));
        int quality = getRSSIasQuality(WiFi.RSSI(indices[i]));

        if (_minimumQuality == -1 || _minimumQuality < quality) {
          String item = FPSTR(HTTP_ITEM);
          String rssiQ;
          rssiQ += quality;
          item.replace("{v}", WiFi.SSID(indices[i]));
          item.replace("{r}", rssiQ);
          if (WiFi.encryptionType(indices[i]) != ENC_TYPE_NONE) {
            item.replace("{i}", "l");
          } else {
            item.replace("{i}", "");
          }
          //DEBUG_WM(item);
          page += item;
          delay(0);
        } else {
          DEBUG_WM(F("Skipping due to quality"));
        }

      }
      page += "<br/>";
    }
  }

  page += FPSTR(HTTP_FORM_START);
  char parLength[2];
  // add the extra parameters to the form
  for (int i = 0; i < _paramsCount; i++) {
    if (_params[i] == NULL) {
      break;
    }

    String pitem = FPSTR(HTTP_FORM_PARAM);
    if (_params[i]->getID() != NULL) {
      pitem.replace("{i}", _params[i]->getID());
      pitem.replace("{n}", _params[i]->getID());
      pitem.replace("{p}", _params[i]->getPlaceholder());
      snprintf(parLength, 2, "%d", _params[i]->getValueLength());
      pitem.replace("{l}", parLength);
      pitem.replace("{v}", _params[i]->getValue());
      pitem.replace("{c}", _params[i]->getCustomHTML());
    } else {
      pitem = _params[i]->getCustomHTML();
    }

    page += pitem;
  }
  if (_params[0] != NULL) {
    page += "<br/>";
  }

  if (_sta_static_ip) {

    String item = FPSTR(HTTP_FORM_PARAM);
    item.replace("{i}", "ip");
    item.replace("{n}", "ip");
    item.replace("{p}", "Static IP");
    item.replace("{l}", "15");
    item.replace("{v}", _sta_static_ip.toString());

    page += item;

    item = FPSTR(HTTP_FORM_PARAM);
    item.replace("{i}", "gw");
    item.replace("{n}", "gw");
    item.replace("{p}", "Static Gateway");
    item.replace("{l}", "15");
    item.replace("{v}", _sta_static_gw.toString());

    page += item;

    item = FPSTR(HTTP_FORM_PARAM);
    item.replace("{i}", "sn");
    item.replace("{n}", "sn");
    item.replace("{p}", "Subnet");
    item.replace("{l}", "15");
    item.replace("{v}", _sta_static_sn.toString());

    page += item;

    page += "<br/>";
  }

  page += FPSTR(HTTP_FORM_END);
  page += FPSTR(HTTP_SCAN_LINK);

  page += FPSTR(HTTP_END);

  server->send(200, "text/html", page);


  DEBUG_WM(F("Sent config page"));
}

/** Handle the WLAN save form and redirect to WLAN config page again */
void EAVManager::handleWifiSave() {
  DEBUG_WM(F("WiFi save"));

  //SAVE/connect here
  _ssid = server->arg("s").c_str();
  _pass = server->arg("p").c_str();

  //parameters
  for (int i = 0; i < _paramsCount; i++) {
    if (_params[i] == NULL) {
      break;
    }
    //read parameter
    String value = server->arg(_params[i]->getID()).c_str();
    //store it in array
    value.toCharArray(_params[i]->_value, _params[i]->_length);
    DEBUG_WM(F("Parameter"));
    DEBUG_WM(_params[i]->getID());
    DEBUG_WM(value);
  }

  if (server->arg("ip") != "") {
    DEBUG_WM(F("static ip"));
    DEBUG_WM(server->arg("ip"));
    //_sta_static_ip.fromString(server->arg("ip"));
    String ip = server->arg("ip");
    optionalIPFromString(&_sta_static_ip, ip.c_str());
  }
  if (server->arg("gw") != "") {
    DEBUG_WM(F("static gateway"));
    DEBUG_WM(server->arg("gw"));
    String gw = server->arg("gw");
    optionalIPFromString(&_sta_static_gw, gw.c_str());
  }
  if (server->arg("sn") != "") {
    DEBUG_WM(F("static netmask"));
    DEBUG_WM(server->arg("sn"));
    String sn = server->arg("sn");
    optionalIPFromString(&_sta_static_sn, sn.c_str());
  }

  String page = FPSTR(HTTP_HEAD);
  page.replace("{v}", "Credentials Saved");
  page += FPSTR(HTTP_SCRIPT);
  page += FPSTR(HTTP_STYLE);
  page += _customHeadElement;
  page += FPSTR(HTTP_HEAD_END);
  page += FPSTR(HTTP_SAVED);
  page += FPSTR(HTTP_END);

  server->send(200, "text/html", page);

  DEBUG_WM(F("Sent wifi save page"));

  connect = true; //signal ready to connect/reset
}

/** Handle the info page */
void EAVManager::handleInfo() {
  DEBUG_WM(F("Info"));

  String page = FPSTR(HTTP_HEAD);
  page.replace("{v}", "Info");
  page += FPSTR(HTTP_SCRIPT);
  page += FPSTR(HTTP_STYLE);
  page += _customHeadElement;
  page += FPSTR(HTTP_HEAD_END);
  page += F("<dl>");
  page += F("<dt>Chip ID</dt><dd>");
  page += ESP.getChipId();
  page += F("</dd>");
  page += F("<dt>Flash Chip ID</dt><dd>");
  page += ESP.getFlashChipId();
  page += F("</dd>");
  page += F("<dt>IDE Flash Size</dt><dd>");
  page += ESP.getFlashChipSize();
  page += F(" bytes</dd>");
  page += F("<dt>Real Flash Size</dt><dd>");
  page += ESP.getFlashChipRealSize();
  page += F(" bytes</dd>");
  page += F("<dt>Soft AP IP</dt><dd>");
  page += WiFi.softAPIP().toString();
  page += F("</dd>");
  page += F("<dt>Soft AP MAC</dt><dd>");
  page += WiFi.softAPmacAddress();
  page += F("</dd>");
  page += F("<dt>Station MAC</dt><dd>");
  page += WiFi.macAddress();
  page += F("</dd>");
  page += F("</dl>");
  page += FPSTR(HTTP_END);

  server->send(200, "text/html", page);

  DEBUG_WM(F("Sent info page"));
}

/** Handle the reset page */
void EAVManager::handleReset() {
  DEBUG_WM(F("Reset"));

  String page = FPSTR(HTTP_HEAD);
  page.replace("{v}", "Info");
  page += FPSTR(HTTP_SCRIPT);
  page += FPSTR(HTTP_STYLE);
  page += _customHeadElement;
  page += FPSTR(HTTP_HEAD_END);
  page += F("Module will reset in a few seconds.");
  page += FPSTR(HTTP_END);
  server->send(200, "text/html", page);

  DEBUG_WM(F("Sent reset page"));
  delay(5000);
  ESP.reset();
  delay(2000);
}

void EAVManager::handleNotFound() {
  if (captivePortal()) { // If captive portal redirect instead of displaying the error page.
    return;
  }
  String message = "File Not Found\n\n";
  message += "URI: ";
  message += server->uri();
  message += "\nMethod: ";
  message += ( server->method() == HTTP_GET ) ? "GET" : "POST";
  message += "\nArguments: ";
  message += server->args();
  message += "\n";

  for ( uint8_t i = 0; i < server->args(); i++ ) {
    message += " " + server->argName ( i ) + ": " + server->arg ( i ) + "\n";
  }
  server->sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server->sendHeader("Pragma", "no-cache");
  server->sendHeader("Expires", "-1");
  server->send ( 404, "text/plain", message );
}


/** Redirect to captive portal if we got a request for another domain. Return true in that case so the page handler do not try to handle the request again. */
boolean EAVManager::captivePortal() {
  if (!isIp(server->hostHeader()) ) {
    DEBUG_WM(F("Request redirected to captive portal"));
    server->sendHeader("Location", String("http://") + toStringIp(server->client().localIP()), true);
    server->send ( 302, "text/plain", ""); // Empty content inhibits Content-length header so we have to close the socket ourselves.
    server->client().stop(); // Stop is needed because we sent no content length
    return true;
  }
  return false;
}

//start up config portal callback
void EAVManager::setAPCallback( void (*func)(EAVManager* myEAVManager) ) {
  _apcallback = func;
}

//start up save config callback
void EAVManager::setSaveConfigCallback( void (*func)(void) ) {
  _savecallback = func;
}

//sets a custom element to add to head, like a new style tag
void EAVManager::setCustomHeadElement(const char* element) {
  _customHeadElement = element;
}

//if this is true, remove duplicated Access Points - defaut true
void EAVManager::setRemoveDuplicateAPs(boolean removeDuplicates) {
  _removeDuplicateAPs = removeDuplicates;
}



template <typename Generic>
void EAVManager::DEBUG_WM(Generic text) {
  if (_debug) {
    Serial.print("EAVWM: ");
    Serial.println(text);
  }
}

int EAVManager::getRSSIasQuality(int RSSI) {
  int quality = 0;

  if (RSSI <= -100) {
    quality = 0;
  } else if (RSSI >= -50) {
    quality = 100;
  } else {
    quality = 2 * (RSSI + 100);
  }
  return quality;
}

/** Is this an IP? */
boolean EAVManager::isIp(String str) {
  for (int i = 0; i < str.length(); i++) {
    int c = str.charAt(i);
    if (c != '.' && (c < '0' || c > '9')) {
      return false;
    }
  }
  return true;
}

/** IP to String? */
String EAVManager::toStringIp(IPAddress ip) {
  String res = "";
  for (int i = 0; i < 3; i++) {
    res += String((ip >> (8 * i)) & 0xFF) + ".";
  }
  res += String(((ip >> 8 * 3)) & 0xFF);
  return res;
}
