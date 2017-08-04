# --- DEVELOPER NOTES ---

# In case of Micropython and LUA-based firmwares, there's always main file to
# be executed. Builder will write our static variables to beginning of that file.

# Note: platformio uses .py files as custom scripts so we cannot simply match for .py to decide the project is micropython-based!


# THiNX Example device application

# Roadmap:
# TODO: HTTPS proxy support
# TODO: convert to thinx class

import urequests
import ubinascii
import network
import time
import machine
import os
import uos
import ujson

from network import WLAN
from mqtt import MQTTClient
import machine
import time

try:
    settings = ujson.loads('thinx.json')

    # Load globals from list
    THINX_COMMIT_ID                 = settings['THINX_COMMIT_ID']
    THINX_FIRMWARE_VERSION_SHORT    = settings['THINX_FIRMWARE_VERSION_SHORT']
    THINX_FIRMWARE_VERSION          = settings['THINX_FIRMWARE_VERSION']
    THINX_UDID                      = settings['THINX_UDID']
    THINX_CLOUD_URL                 = settings['THINX_CLOUD_URL']
    THINX_MQTT_URL                  = settings['THINX_MQTT_URL']
    THINX_API_KEY                   = settings['THINX_API_KEY']
    THINX_DEVICE_ALIAS              = settings['THINX_DEVICE_ALIAS']
    THINX_DEVICE_OWNER              = settings['THINX_DEVICE_OWNER']
    THINX_AUTO_UPDATE               = settings['THINX_AUTO_UPDATE']
    THINX_PROXY                     = settings['THINX_PROXY']
    THINX_MQTT_PORT                 = settings['THINX_MQTT_PORT']
    THINX_API_PORT                  = settings['THINX_API_PORT']
    THINX_ENV_SSID                  = settings['THINX_ENV_SSID']
    THINX_ENV_PASS                  = settings['THINX_ENV_PASS']

    if THINX_ENV_SSID==None or THINX_ENV_PASS=None:
        print("THiNX: THINX_ENV_SSID and THINX_ENV_PASS must be set for headless devices without captive portal / AP mode!")

except Exception:
    print("THINX: JSON configuration did not load.")

# Required parameters without captive portal
SSID = THINX_ENV_SSID
PASSWORD = THINX_ENV_PASS
TIMEOUT = 180

#class THiNXException(Exception):
#    pass

#class THiNXClient:

#    def __init__(self, api_key):
#        self.api_key = api_key

#        self.THINX_COMMIT_ID=THINX_COMMIT_ID
#        self.THINX_FIRMWARE_VERSION_SHORT=THINX_FIRMWARE_VERSION_SHORT
#        self.THINX_FIRMWARE_VERSION=THINX_FIRMWARE_VERSION
#        self.THINX_UDID=THINX_UDID
#        self.THINX_CLOUD_URL=THINX_CLOUD_URL
#        self.THINX_MQTT_URL=THINX_MQTT_URL
#        self.THINX_API_KEY=THINX_API_KEY
#        self.THINX_DEVICE_ALIAS=THINX_DEVICE_ALIAS
#        self.THINX_DEVICE_OWNER=THINX_DEVICE_OWNER
#        self.THINX_AUTO_UPDATE=THINX_AUTO_UPDATE
#        self.THINX_PROXY=THINX_PROXY
#        self.THINX_MQTT_PORT=THINX_MQTT_PORT
#        self.THINX_API_PORT=THINX_API_PORT
#        ... to be done later...

mqtt_client = None
mqtt_connected = False
available_update_url = None

thx_connected_response = '{ "status" : "connected" }'
thx_disconnected_response = '{ "status" : "disconnected" }'
thx_reboot_response = '{ "status" : "rebooting" }'
thx_update_question = '{ title: "Update Available", body: "There is an update available for this device. Do you want to install it now?", type: "actionable", response_type: "bool" }"'
thx_update_success = '{ title: "Update Successful", body: "The device has been successfully updated.", type: "success" }'

def registration_json_body():
    return '{"registration": {"mac": "' + thinx_device_mac() + '", "firmware": "' + THINX_FIRMWARE_VERSION + '", "commit": "' + THINX_COMMIT_ID + '", "version": "' + THINX_FIRMWARE_VERSION_SHORT + '", "commit": "' + THINX_COMMIT_ID + '", "alias": "' + THINX_ALIAS + '", "udid" :"' + THINX_UDID + '", "owner" : "' + THINX_OWNER + '", "platform" : "nodemcu" }}'

def thinx_device_mac():
    wlan = network.WLAN(network.STA_IF)
    mac = wlan.config('mac')
    return ubinascii.hexlify(mac)

def mqtt_device_channel():
    return "/" + THINX_OWNER + "/" + THINX_UDID

def mqtt_status_channel():
    return mqtt_device_channel() + "/status"
#
# CONNECTION
#

KEEPALIVE = 120
CLEANSESSION = False # set falst to keep retained messages

# LWT has default QoS but is retained
MQTT_LWT_QOS = 0
MQTT_LWT_RETAIN = 1

# default MQTT QoS can lose messages
MQTT_QOS = 0
MQTT_RETAIN = 1

# device channel has QoS 2 and msut keep retained messages until device gets reconnected
MQTT_DEVICE_QOS = 2 # do not loose anything, require confirmation... (may not be supported)

def connect(ssid, password):
    sta_if = network.WLAN(network.STA_IF)
    ap_if = network.WLAN(network.AP_IF)
    if ap_if.active():
        ap_if.active(False)
    if not sta_if.isconnected():
        print('THiNX: Connecting to WiFi...')
        sta_if.active(True)
        sta_if.connect(ssid, password)
        while not sta_if.isconnected():
            pass
    else:
        THINX_UDID=sta_if.config('mac')
        thinx_register()
        thinx_mqtt() # should be at and of parse

    print('THiNX: Network configuration:', sta_if.ifconfig())

# Example step 1: registration (device check-in)
def thinx_register():
    print('THiNX: Device registration...')
    url = 'http://thinx.cloud:7442/device/register' # register/check-in device
    headers = {'Authentication': THINX_API_KEY,
               'Accept': 'application/json',
               'Origin': 'device',
               'Content-Type': 'application/json',
               'User-Agent': 'THiNX-Client'}
    print(headers)
    registration_request = { 'registration': {'mac': thinx_device_mac(),
                    'firmware': THINX_FIRMWARE_VERSION,
                    'version': THINX_FIRMWARE_VERSION_SHORT,
                    'hash': THINX_COMMIT_ID,
                    'alias': THINX_DEVICE_ALIAS,
                    'owner': THINX_DEVICE_OWNER,
                    'udid': THINX_UDID}}
    data = ujson.dumps(registration_request)
    print(data)
    resp = urequests.post(url, data=data, headers=headers)

    if resp:
        print("THiNX: Server replied...")
        print(resp.json())
        parse(resp.json())
    else:
        print("THiNX: No response.")

    resp.close()

# Example step 2: device update
def thinx_update(data):
    url = 'http://thinx.cloud:7442/device/firmware'
    headers = {'Authentication': THINX_API_KEY,
               'Accept': 'application/json',
               'Origin': 'device',
               'Content-Type': 'application/json',
               'User-Agent': 'THiNX-Client'}
    print(headers)
    update_request = { 'update': {'mac': thinx_device_mac(),
                       'hash': data.hash,
                       'commit': data.commit,
                       'alias': data.alias,
                       'owner': data.owner,
                       'udid': THINX_UDID }}

    data = ujson.dumps(update_request)
    print(data)

    resp = urequests.post(url, data=data, headers=headers)

    if resp:
        print("THiNX: Server replied...")
        print(resp.json())
        update_and_reboot(resp)
    else:
        print("THiNX: No response.")

    resp.close()

#
# RESPONSE PARSER
#

def parse(response):

    # Check 'success'

    try:
        success = response['success']
        print("THINX: Parsing success response:")
        print(response)
        if success==False:
            print("THiNX: Failure.")
            return
    except Exception:
        print("THINX: No primary success key found.")

    parse_update(response)
    parse_registration(response)
    parse_notification(response)

    print("THiNX: Parser completed.")

    if THINX_UDID=="":
        print("* THiNX: MQTT cannot be used until UDID will be assigned.")
    else:
        thinx_mqtt()

#
# DEVICE INFO
#

# provides only current status as JSON so it can be loaded/saved independently
def get_device_info():
    json_object = {'alias': THINX_DEVICE_ALIAS,
                   'owner': THINX_DEVICE_OWNER,
                   'apikey': THINX_API_KEY,
                   'udid': THINX_UDID,
                   'available_update_url': available_update_url,
                   'platform': 'micropython'
                   }
    return ujson.dumps(json_object)

# apply given device info to current runtime environment
def apply_device_info(info):
    THINX_DEVICE_ALIAS=info['alias']
    THINX_DEVICE_OWNER=info['owner']
    THINX_API_KEY=info['apikey']
    THINX_UDID=info['udid']
    available_update_url=info['available_update_url']

# Used by response parser
def save_device_info():
    print("THINX: Saving device info")
    f = open('thinx.cfg', 'w')
    if f:
        f.write(get_device_info())
        f.close()

# Restores incoming data from filesystem overriding build-time-constants
def restore_device_info():
    f = open('thinx.cfg', 'r')
    if f:
        print("THINX: Restoring device info")
        info = f.read('\n')
        f.close()
        apply_device_info(ujson.loads(info))
    else:
        print("THINX: No config file found")

#
# MQTT
#

def mqtt_publish(channel, message):
    if mqtt_client!=None:
        mqtt_client.publish(channel, message)

def thinx_mqtt_timeout():
    mqtt_connected=False

def thinx_mqtt():

    restore_device_info()

    if not THINX_API_KEY:
        print("* THiNX: MQTT init failed...")
        return

    print("* THiNX: Initializing MQTT client " + THINX_UDID + " / " + THINX_API_KEY)

    mqtt_client = MQTTClient(thinx_device_mac(), THINX_MQTT_URL, THINX_MQTT_PORT, THINX_DEVICE_OWNER, THINX_API_KEY, keepalive=0,
                 ssl=False, ssl_params={})
    mqtt_client.settimeout = thinx_mqtt_timeout
    mqtt_client.set_callback = thinx_mqtt_callback
    mqtt_client.set_last_will(mqtt_status_channel(), thx_disconnected_response, retain=True, qos=0)
    if mqtt_client.connect():
        mqtt_connected=True
        mqtt_client.subscribe(mqtt_device_channel(), MQTT_DEVICE_QOS)
        mqtt_client.subscribe(mqtt_status_channel(), MQTT_QOS)
        mqtt_client.publish(mqtt_status_channel(), thx_connected_response, MQTT_RETAIN, MQTT_QOS)

    if mqtt_connected==False:
        print("* THiNX: Re/connecting MQTT to " + THINX_MQTT_URL + "...")
        if mqtt_client.connect():
            mqtt_connected=True
            mqtt_client.subscribe(mqtt_device_channel(), MQTT_DEVICE_QOS)
            mqtt_client.subscribe(mqtt_status_channel(), MQTT_QOS)
            mqtt_client.publish(mqtt_status_channel(), thx_connected_response, MQTT_RETAIN, MQTT_QOS)

def thinx_mqtt_callback(topic, msg):
    print("* THiNX: Message on topic: " + topic)
    if data!=None:
        process_mqtt(data)

def process_mqtt(response):
    print(response)
    try:
        json = ujson.loads(response)

        try:
            upd = json['update']
            if upd:
                update_and_reboot(upd)
        except Exception:
            pass

        try:
            msg = json['message']
            if msg:
                parse(json)
        except Exception:
            pass

    except Exception:
        print("* THiNX: Processing MQTT payload failed: " + response)

def parse_notification(response):
    try:
        no = response['notification']
        print("THINX: Parsing registration response:")
        print(reg)
    except Exception:
        print("THiNX: No registration key found.")

    if no:
        try:
            type = no['response_type']
            if type=="bool" or type=="boolean":
                response = no['response']
                if response==True:
                  print("User allowed update using boolean.")
                  thinx_update(available_update_url) # should fetch OTT without url
                  return True
                else:
                  print("User denied update using boolean.")
                  return False

            if type=="string" or type=="String":
                response = no['response']
                if response=="yes":
                  print("User allowed update using boolean.")
                  thinx_update(available_update_url) # should fetch OTT without url
                  return True
                else:
                  print("User denied update using boolean.")
                  return False

        except Exception:
                print("THINX: No response_type success key...")
                return False

def parse_registration(response):
    try:
        reg = response['registration']
        print("THINX: Parsing registration response:")
        print(reg)
    except Exception:
        print("THiNX: No registration key found.")

    if reg:
        try:
            success = reg['success']
            if success==False:
                print("THiNX: Registration failure.")
                return
        except Exception:
                print("THINX: No registration success key...")

        try:
            status = reg['status']

            if success=="OK":

                try:
                    THINX_DEVICE_OWNER = reg['owner']
                    print("THINX: Overriding owner from API: " + THINX_DEVICE_OWNER)
                except Exception:
                    pass

                try:
                    THINX_DEVICE_ALIAS = reg['alias']
                    print("THINX: Overriding alias from API: " + THINX_DEVICE_ALIAS)
                except Exception:
                    pass

                try:
                    THINX_API_KEY = reg['apikey']
                    print("THINX: Overriding apikey from API: " + THINX_API_KEY)
                except Exception:
                    pass

                try:
                    THINX_UDID = reg['udid']
                    print("THINX: Overriding udid from API: " + THINX_UDID)
                except Exception:
                    pass

                save_device_info()

                # Check current firmware based on commit id and store Updated state...
                commit = reg['commit']
                print("commit: " + commit)

                # Check current firmware based on version and store Updated state...
                version = reg['version']
                print("version: " + version)

                if commit==THINX_COMMIT_ID and version==THINX_FIRMWARE_VERSION:
                    print("*TH: firmware has same commit_id as current and update availability is stored. Firmware has been installed.")
                    available_update_url = None
                    save_device_info()
                    notify_on_successful_update()
                    return True
                else:
                    print("*TH: Info: firmware has same commit_id as current and no update is available.")

            if success=="FIRMWARE_UPDATE":
                mac = reg['mac'] # -- TODO: must be current or 'ANY'
                commit = reg['commit']
                if commit==THINX_COMMIT_ID:
                    print("*TH: Warning: new firmware has same commit_id as current.")
                version = reg['version']
                print("version: " + version)
                print("Starting update...")
                try:
                    update_url = reg['url']
                    if update_url!=None:
                        print("*TH: Running update with URL:" + update_url)
                        thinx_update(update_url)
                        return True
                except Exception:
                    print("No update url.")
        except Exception:
                print("THINX: No status key...")
                return True

def parse_update(response):
    try:
        upd = response['update']
        if upd:
            try:
                mac = upd['mac']
            except Exception:
                print("THiNX: No mac key found.")

            try:
                commit = upd['commit']
            except Exception:
                print("THiNX: No commit key found.")

            try:
                version = upd['version']
            except Exception:
                print("THiNX: No version key found.")

            try:
                url = upd['url']
            except Exception:
                print("THiNX: No url key found.")

            if commit==THINX_COMMIT_ID and version==THINX_FIRMWARE_VERSION:
                print("*TH: firmware has same commit_id as current and update availability is stored. Firmware has been installed.")
                available_update_url = None
                save_device_info()
                notify_on_successful_update()
                return True
            else:
                print("*TH: Info: firmware has same commit_id as current and no update is available.")

            if THINX_AUTO_UPDATE == False:
                send_update_question()
            else:
                print("Starting update...")
                if url!=null:
                    available_update_url = url
                    save_device_info()
                    if available_update_url!=None:
                        print("*TH: Force update URL:" + available_update_url);
                        thinx_update(available_update_url)
                        return True
    except Exception:
        print("THiNX: No update key found.")

def notify_on_successful_update():
    if mqtt_client!=None:
        mqtt_client.publish(mqtt_status_channel(), thx_update_success, MQTT_LWT_RETAIN, MQTT_LWT_QOS)
        print("notify_on_successful_update: sent")
    else:
        print("notify_on_successful_update: Device updated but MQTT not active to notify. TODO: Store.")

def send_update_question():
    if mqtt_client!=None:
        mqtt_client.publish(mqtt_status_channel(), thx_update_question, MQTT_LWT_RETAIN, MQTT_LWT_QOS)
        print("send_update_question: sent")
    else:
        print("send_update_question: Device updated but MQTT not active to notify. TODO: Store.")

#
# UPDATES
#

# -- the update payload may contain files, URL or OTT

def update_file(name, data):
    file = open(name, 'w')
    if file!=False:
        file.write(response)
        file.close()
        return True
    else:
        return False


# TODO: def update_from_url(name, url)
def update_from_url(name, url):

    headers = {'Authentication': THINX_API_KEY,
               'Accept': 'application/json',
               'Origin': 'device',
               'Content-Type': 'application/json',
               'User-Agent': 'THiNX-Client'}
    print(headers)
    resp = urequests.get(url, headers=headers)

    if resp:
        print("THiNX: Server replied...")
        update_and_reboot(resp)
        resp.close() # maybe sooner or not at all?
    else:
        print("* THiNX: Update from URL failed...")

def update_and_reboot(payload):


    # initial implementation, TODO: DANGER! FIXME!
    #if update_file('thinx.py', response):
    #    if mqtt_client!=None:
    #        mqtt_client.publish(mqtt_status_channel(), thx_reboot_response, MQTT_LWT_RETAIN, MQTT_LWT_QOS)
    #    machine.reset()
    #else:
    #    print("THINX: failed to update thinx.py.")

    # update variants
    try:
        files = payload['files']
    except Exception:
        pass

    try:
        ott = payload['ott']
    except Exception:
        pass

    try:
        url = payload['url']
    except Exception:
        pass

    try:
        type = payload['type']
    except Exception:
        type = "file"

    name = 'thinx.new' # should be swapped with thinx.py only after success

    if files:
        uos.rename('thinx.py', 'thinx.bak')
# only on success
# uos.rename('thinx.py', 'thinx.bak')
# uos.rename('thinx.new', 'thinx.py')
        success = False
        for file in files:
            try:
                name = file['name']
            except Exception:
                pass
            try:
                data = file['data']
            except Exception:
                pass
            try:
                url = file['url']
            except Exception:
                pass
            if name and data:
                success = update_file(name, data)
            elif name!=None and url!=None:
                update_from_url(name, url)
                success = True # why?
            else:
                print("* THiNX: MQTT Update payload has invalid file descriptors.")
    else:
        print("* THiNX: MQTT Update payload is missing file descriptors.")


    if ott:
        if type=="file":
            print("* THiNX: Updating " + name + " from URL " + url)
            update_from_url(name, url)
            print("* THiNX: rebooting...")
            success = True
        else:
            print("Whole firmware update will be supported in future.")

    if success:
        print("* THiNX: Update successful, rebooting...")
        mqtt_publish(mqtt_status_channel(), thx_reboot_response)
        machine.reset()
    else:
        uos.rename("thinx.bak", "thinx.lua")
        print("* THiNX: Update aborted.")

#
# CORE LOOP
#

def thinx():
    global THINX_UDID
    restore_device_info()
    connect(SSID, PASSWORD)

def main():

    print("")
    print ("* THiNX:Client v0.9.3") # compatible with API 1.9.29

    while True:
        try:
            thinx()
        except TypeError:
            pass
        time.sleep(TIMEOUT)

if __name__ == '__main__':
    print('THiNX: Register device.')
    main()
