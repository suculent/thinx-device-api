# --- DEVELOPER NOTES ---

# In case of Micropython and LUA-based firmwares, there's always main file to
# be executed. Builder will write our static variables to beginning of that file.

# Note: platformio uses .py files as custom scripts so we cannot simply match for .py to decide the project is micropython-based!
# We'll default to main.my then.

# --- beginning of machine-generated header

#
# This is an auto-generated stub, it will be pre-pended by THiNX on cloud build.
#

import os

# build-time constants
THINX_COMMIT_ID="micropython-test"
THINX_FIRMWARE_VERSION_SHORT = os.uname().release.split("(")[0] # remove non-semantic part
THINX_FIRMWARE_VERSION = os.uname().version # inject THINX_FIRMWARE_VERSION_SHORT
THINX_UDID="" # each build is specific only for given udid to prevent data leak

# dynamic variables (adjustable by user but overridden from API)
THINX_CLOUD_URL="thinx.cloud" # can change to proxy (?)
THINX_MQTT_URL="thinx.cloud" # should try thinx.local first for proxy
THINX_API_KEY="88eb20839c1d8bf43819818b75a25cef3244c28e77817386b7b73b043193cef4" # will change in future to support rolling api-keys
THINX_DEVICE_ALIAS="micropython-test"
THINX_DEVICE_OWNER="eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f"
THINX_AUTO_UPDATE=True
THINX_PROXY="thinx.local"

THINX_MQTT_PORT = 1883
THINX_API_PORT = 7442

# --- end of machine-generated code

# THiNX Example device application

# Roadmap:
# TODO: Perform update request and replace boot.py OVER-THE-AIR
# TODO: Support MQTT
# TODO: HTTPS proxy support
# TODO: convert to thinx module

# Required parameters
SSID = '6RA'
PASSWORD = 'quarantine'
TIMEOUT = 180

import urequests
import ubinascii
import network
import time
import ujson
import machine
import os

# Prerequisite: WiFi connection
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
        thinx_mqtt()

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
    registration_request = { 'registration': {'mac': thinx_mac(),
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
        process_thinx_response(resp.json())
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
    update_request = { 'update': {'mac': thinx_mac(),
                       'hash': data.hash,
                       'checksum': data.checksum,
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
        process_thinx_update(resp)
    else:
        print("THiNX: No response.")

    resp.close()

def process_thinx_update(response):
    file = open('boot.py', 'w')
    if file!=False:
        file.write(response)
        file.close()
        machine.reset()
    else:
        print("THINX: failed to open boot.py for writing")


def process_thinx_response(response):

    #print("THINX: Parsing response:")
    #print(response)

    try:
        success = response['success']
        print("THINX: Parsing success response:")
        print(response)
        if success==False:
            print("THiNX: Failure.")
            return
    except Exception:
        print("THINX: No primary success key found.")

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
            THINX_UDID = reg['device_id']
            print("THINX: Overriding device_id from API: " + THINX_UDID)
        except Exception:
            pass

        save_device_info()

    try:
        upd = response['update']
        if upd:
            if thinx_update():
                if THINX_AUTO_UPDATE:
                    print("TODO: Update boot.py") # https://github.com/pfalcon/yaota8266 - ota_server: step 4 only...

    except Exception:
        print("THiNX: No update key found.")

    print("THiNX: Parser completed.")

# provides only current status as JSON so it can be loaded/saved independently
def get_device_info():
    json_object = {'alias': THINX_DEVICE_ALIAS,
                   'owner': THINX_DEVICE_OWNER,
                   'apikey': THINX_API_KEY,
                   'udid': THINX_UDID
                   }
    return ujson.dumps(json_object)

# apply given device info to current runtime environment
def set_device_info(info):
    THINX_DEVICE_ALIAS=info['alias']
    THINX_DEVICE_OWNER=info['owner']
    THINX_API_KEY=info['apikey']
    THINX_UDID=info['device_id']

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
        set_device_info(ujson.loads(info))
    else:
        print("THINX: No config file found")

def thinx_mqtt():
    print("THINX: MQTT: To be implemented later")

def process_mqtt(response):
    print(response)
    process_thinx_response(response)

# local platform helpers

def thinx_mac():
    wlan = network.WLAN(network.STA_IF)
    mac = wlan.config('mac')
    return ubinascii.hexlify(mac) # todo: convert to string, returs binary!

# main library function

def thinx():
    global THINX_UDID
    restore_device_info()

    if THINX_UDID=="":
        THINX_UDID=thinx_mac()

    connect(SSID, PASSWORD)

def main():

    while True:
        try:
            thinx()
        except TypeError:
            pass
        time.sleep(TIMEOUT)

if __name__ == '__main__':
    print('THiNX: Register device.')
    main()
