-- THiNX Example device application
-- Requires following nodemcu modules: http,mqtt,net,cjson,wifi

--- TESTED-WITH:
-- NodeMCU custom build by frightanic.com
--	branch: master
--	commit: b96e31477ca1e207aa1c0cdc334539b1f7d3a7f0
--	SSL: false
--	modules: adc,bit,cjson,coap,enduser_setup,file,gpio,http,i2c,mqtt,net,node,ow,pwm,sntp,spi,struct,tmr,uart,websocket,wifi
-- build 	built on: 2017-02-10 21:52
-- powered by Lua 5.1.4 on SDK 2.0.0(656edbf)

--
-- VARIABLES AND CONSTANTS
--

print("")
print ("* THiNX:Client v0.9.26") -- compatible with API 1.9.29

dofile("config.lua") -- must contain 'ssid', 'password' because this firmware does not currently support captive portal

mqtt_client = nil
mqtt_connected = false
available_update_url = nil

thx_connected_response = "{ \"status\" : \"connected\" }"
thx_disconnected_response = "{ \"status\" : \"disconnected\" }"
thx_reboot_response = "{ \"status\" : \"rebooting\" }"
thx_update_question = "{ title: \"Update Available\", body: \"There is an update available for this device. Do you want to install it now?\", type: \"actionable\", response_type: \"bool\" }";
thx_update_success = "{ title: \"Update Successful\", body: \"The device has been successfully updated.\", type: \"success\" }";

function registration_json_body()
  return '{"registration": {"mac": "'..thinx_device_mac()..'", "firmware": "'..THINX_FIRMWARE_VERSION..'", "commit": "' .. THINX_COMMIT_ID .. '", "version": "'..THINX_FIRMWARE_VERSION_SHORT..'", "checksum": "' .. THINX_COMMIT_ID .. '", "alias": "' .. THINX_ALIAS .. '", "udid" :"' ..THINX_UDID..'", "owner" : "'..THINX_OWNER..'", "platform" : "nodemcu" }}'
end

function thinx_device_mac()
  return wifi.sta.getmac()
end

function mqtt_device_channel()
  return "/"..THINX_OWNER.."/".. THINX_UDID
end

function mqtt_status_channel()
  return mqtt_device_channel() .. "/status"
end

--
-- CONNECTION
--

KEEPALIVE = 120
CLEANSESSION = false -- set falst to keep retained messages

-- LWT has default QoS but is retained
MQTT_LWT_QOS = 0
MQTT_LWT_RETAIN = 1

-- default MQTT QoS can lose messages
MQTT_QOS = 0
MQTT_RETAIN = 1

-- device channel has QoS 2 and msut keep retained messages until device gets reconnected
MQTT_DEVICE_QOS = 2 -- do not loose anything, require confirmation... (may not be supported)

function connect(ssid, password)
  wifi.setmode(wifi.STATION)
  wifi.sta.config(ssid, password)
  wifi.sta.connect()
  tmr.alarm(1, 5000, 1, function()
    if wifi.sta.getip() == nil then
      print("* THiNX: Connecting " .. ssid .. "...")
    else
      tmr.stop(1)
      print("* THiNX: Connected to " .. ssid .. ", IP is "..wifi.sta.getip())
      thinx_register()
    end
  end)
end

-- devuce registration request
function thinx_register()
  restore_device_info()
  url = 'http://' .. THINX_CLOUD_URL .. ':7442/device/register'
  headers = 'Authentication:' .. THINX_API_KEY .. '\r\n' ..
            'Accept: application/json\r\n' ..
            'Origin: device\r\n' ..
            'Content-Type: application/json\r\n' ..
            'User-Agent: THiNX-Client\r\n'
  data = registration_json_body()
  print("* THiNX: Registration request: " .. data)
  http.post(url, headers, data,
    function(code, data)
      if (code < 0) then
        print("* THiNX: HTTP request failed")
      else
        -- print("* THiNX: HTTP response: ", code, data)
        if code == 200 then
          parse(data)
      end
    end
  end)
end

-- firmware update request
function thinx_update(update_url)

  if update_url ~= null then
    url = update_url
  else
    url = 'http://' .. THINX_CLOUD_URL .. ':7442/device/firmware'
  end

  headers = 'Authentication: ' .. THINX_API_KEY .. '\r\n' ..
            'Accept: */*\r\n' ..
            'Origin: device\r\n' ..
            'Content-Type: application/json\r\n' ..
            'User-Agent: THiNX-Client\r\n'

  data = registration_json_body()
  print("* THiNX: Update Request: " .. data)
  http.post(url, headers, body,
    function(code, data)
      if (code < 0) then
        print("* THiNX: HTTP request failed")
      else
        print("* THiNX: HTTP response: ", code, data)
        if code == 200 then
          print("* THiNX: Attempting to install update with response: " .. data)
          print("* THiNX: TODO: Calculate data checksum...")
          update_and_reboot(data)
      end
    end
  end)
end

--
-- RESPONSE PARSER
--

-- process incoming JSON response (both MQTT/HTTP) for register/force-update/update and forward others to client app)
function parse(response_json)

  local ok, response = pcall(cjson.decode, response_json)
  if ok then
    parse_update(json)
    parse_registration(response)
    parse_notification(response)
  else
    print("* THiNX: JSON could not be parsed:" .. response_json)
  end

  if THINX_UDID == "" then
    print("* THiNX: MQTT cannot be used until UDID will be assigned.")
  else
    thinx_mqtt()
  end
end

--
-- DEVICE INFO
--

-- provides only current status as JSON so it can be loaded/saved independently
function get_device_info()

  device_info = {}

  if THINX_ALIAS ~= "" then
    device_info['alias'] = THINX_ALIAS
  end

  if THINX_OWNER ~= "" then
    device_info['owner'] = THINX_OWNER
  end

  if THINX_API_KEY~= "" then
    device_info['apikey'] = THINX_API_KEY
  end

  if THINX_UDID ~= "" then
    device_info['udid'] = THINX_UDID
  end

  if available_update_url ~= nil then
    device_info['available_update_url'] = available_update_url
  end

  device_info['platform'] = "nodemcu"

  return device_info

end

-- apply given device info to current runtime environment
function apply_device_info(info)
    if info['alias'] ~= nil then
        THINX_ALIAS = info['alias']
    end
    if info['owner'] ~= nil then
        if info['owner'] ~= "" then
            THINX_OWNER = info['owner']
        end
    end
    if info['apikey'] ~= nil then
        THINX_API_KEY = info['apikey']
    end
    if info['udid'] ~= nil then
        THINX_UDID = info['udid']
    end
    if info['available_update_url'] ~= nil then
        available_update_url = info['available_update_url']
    end
end

-- Used by response parser
function save_device_info()
  if file.open("thinx.cfg", "w") then
    info = cjson.encode(get_device_info())
    file.write(info .. '\n')
    file.close()
  else
    print("* THiNX: failed to open config file for writing")
  end
end

-- Restores incoming data from filesystem overriding build-time-constants
function restore_device_info()
  if file.open("thinx.cfg", "r") then
    data = file.read('\n')
    file.close()
    local ok, info = pcall(cjson.decode, data)
    if ok then
        apply_device_info(info)
    else
        print("* THiNX: Custom configuration could not be parsed." .. data)
    end
  else
    print("* THiNX: No custom configuration stored. Using build-time constants.")
  end
end

--
-- MQTT
--

function thinx_mqtt()

    -- >> this should not be needed at all
    if THINX_API_KEY == nil then
        print("* THiNX: DO-NOT-REMOVE: Reloading vars???")
        dofile("config.lua") -- max require configuration reload..
    end
    -- << until here

    restore_device_info()

    if THINX_API_KEY == nil then
        print("* THiNX: MQTT init failed...")
        return;
    end

    print("* THiNX: Initializing MQTT client "..THINX_UDID.." / "..THINX_API_KEY)
    mqtt_client = mqtt.Client(node.chipid(), KEEPALIVE, THINX_UDID, THINX_API_KEY, 0)
    mqtt_client:lwt(mqtt_status_channel(), thx_disconnected_response, MQTT_LWT_QOS, MQTT_LWT_RETAIN)

    -- subscribe to device channel and publish to status channel
    mqtt_client:on("connect", function(client)
        mqtt_connected = true
        print ("* THiNX: m:connect-01, subscribing to device topic, publishing registration status...")
        client:subscribe(mqtt_device_channel(), MQTT_DEVICE_QOS, function(client) print("* THiNX: Subscribed to device channel (1).") end)
        client:publish(mqtt_status_channel(), registration_json_body(), MQTT_QOS, 0)
        client:publish(mqtt_status_channel(), thx_connected_response, MQTT_QOS, MQTT_RETAIN)
      end)

    mqtt_client:on("offline", function(client)
        print ("* THiNX: m:offline!!!")
        mqtt_connected = false
        --mqtt_client:close()
        -- TODO: attempt reconnect after a while; do not use autoreconnect!
      end)

    mqtt_client:on("message", function(client, topic, data)
      print("* THiNX: Message on topic: " .. topic)
      if data ~= nil then
        process_mqtt(data)
      end
    end)

    if mqtt_connected == false then
      print("* THiNX: Re/connecting MQTT to " .. THINX_MQTT_URL .. "...")
      mqtt_client:connect(THINX_MQTT_URL, THINX_MQTT_PORT, KEEPALIVE, THINX_UDID, THINX_API_KEY,
        function(client)
          mqtt_connected = true
          print ("* THiNX: m:connect-02, subscribing to device topic, publishing registration status...")
          client:subscribe(mqtt_device_channel(), MQTT_DEVICE_QOS, function(client) print("* THiNX: Subscribed to device channel (2).") end)
          client:publish(mqtt_status_channel(), thx_connected_response, MQTT_QOS, MQTT_RETAIN)
          client:publish(mqtt_status_channel(), registration_json_body(), MQTT_QOS, MQTT_RETAIN)
        end,
        function(client, reason)
          mqtt_connected = false
            print("* THiNX: reconnect failed, reason: "..reason)
        end)
    end

end

function process_mqtt(payload_json)
  local ok, payload = pcall(cjson.decode, payload_json)
  if ok then
    local upd = payload['update']
    if upd ~= nil then
      print("* THiNX: Update payload: " ..cjson.encode(upd))
      update_and_reboot(payload)
    end
    local msg = payload['message']
    if msg ~= nil then
      print("* THiNX: Incoming MQTT message: " .. msg)
      parse(msg)
    end
  else
      print("* THiNX: Processing MQTT payload failed: " .. payload_json)
  end
end

function parse_notification(json)
  local no = response['notification']
  if no then
    print("* THiNX: NOTIFICATION: ", cjson.encode(no))
    local type = no['response_type']

    if type == "bool" or type == "boolean" then
      local response = no['response']
      if response == true then
        print("User allowed update using boolean.")
        thinx_update(available_update_url) -- should fetch OTT without url
      else
        print("User denied update using boolean.")
      end
    end

    if type == "string" or type == "String" then
      local response = no['response']
      if response == "yes" then
        print("User allowed update using string.")
        thinx_update(available_update_url) -- should fetch OTT without url
      else
        print("User denied update using string.")
      end
    end
  end
end

function parse_registration(json)
  local reg = response['registration']
  if reg then

    local status = reg['status']

    if status == "OK" then
      print("* THiNX: REGISTRATION: ", cjson.encode(reg))
      if reg['apikey'] ~= nil then
        THINX_API_KEY = reg['apikey']
      end
      if reg['alias'] ~= nil then
        THINX_ALIAS = reg['alias']
      end
      if reg['owner'] ~= nil then
        THINX_OWNER = reg['owner']
      end
      if reg['udid'] ~= nil then
        THINX_UDID = reg['udid']
      end
      save_device_info()

      -- Check current firmware based on commit id and store Updated state...
      local commit = reg['commit']
      print("commit: " .. commit)

      -- Check current firmware based on version and store Updated state...
      local version = reg['version']
      print("version: " .. version)

      if commit == THINX_COMMIT_ID and version == THINX_FIRMWARE_VERSION_SHORT then
        if available_update_url ~= nil then
          available_update_url = nil
          save_device_info()
          notify_on_successful_update()
        end
          print("*TH: Info: firmware has same commit_id as current and no update is available.")
      end

      save_device_info()

    else if status == "FIRMWARE_UPDATE" then

      local mac = reg['mac']
      print("mac: "+mac);
      -- TODO: must be current or 'ANY'

      -- should not be same except for forced update
      local commit = reg['commit']
      if commit == THINX_COMMIT_ID then
        print("*TH: Warning: new firmware has same commit_id as current.")
      end

      local version = reg['version']
      print("version: "..version)

      print("Starting update...")

      local update_url = reg['url']
      if update_url ~= nil then
        print("*TH: Running update with URL:" + update_url)
        thinx_update(update_url)
      else
        print("*TH: Update is available but URL unknown. Requesting OTT...")

        -- TODO: FIXME: ADD OTT REQUEST and MULTIFILE FETCH!


      end

    else
      print("Nothing to do...")
    end

  end
end

function parse_update(json) {
  local upd = response['update']
  if upd then
    print("* THiNX: UPDATE: ", cjson.encode(reg))

    local mac = upd['mac']
    local commit = upd['commit']
    local version = upd['version']
    local url = upd['url']

    if commit == THINX_COMMIT_ID and version == THINX_FIRMWARE_VERSION then
      print("*TH: firmware has same commit_id as current and update availability is stored. Firmware has been installed.")
      available_update_url = nil;
      save_device_info();
      notify_on_successful_update();
      return
    else
      print("*TH: Info: firmware has same commit_id as current and no update is available.")
    end

    if THINX_AUTO_UPDATE == false then
        send_update_question()
    else
        print("Starting update...")
        if url ~= null then
          available_update_url = url
          save_device_info()
          if available_update_url then
              print("*TH: Force update URL:" .. available_update_url);
              thinx_update(available_update_url)
          end
          return
    end
  end
end

function notify_on_successful_update()
  if mqtt_client ~= null then
    client:publish(mqtt_status_channel(), thx_update_success, MQTT_LWT_QOS, MQTT_LWT_RETAIN)
    print("notify_on_successful_update: sent")
  else
    print("notify_on_successful_update: Device updated but MQTT not active to notify. TODO: Store.")
  end
end

function send_update_question()
  if mqtt_client ~= null then
    client:publish(mqtt_status_channel(), thx_update_question, MQTT_LWT_QOS, MQTT_LWT_RETAIN)
    print("send_update_question: sent")
  else
    print("send_update_question: Device updated but MQTT not active to notify. TODO: Store.")
  end
end

--
-- UPDATES
--

-- update specific filename on filesystem with data, returns success/false
function update_file(name, data)
  if file.open(name, "w") then
    print("* THiNX: Uploading new file: "..name)
    file.write(data)
    file.close()
    return true
  else
    print("* THiNX: failed to open " .. name .. " for writing!")
    return false
  end
end

-- update specific filename on filesystem with data from URL
function update_from_url(name, url)
  http.get(url, nil, function(code, data)
    if (code < 0) then
      print("* THiNX: HTTP Update request failed")
    else
      if code == 200 then
        local success = update_file(name, data)
        if success then
          print("* THiNX: Updated from URL, rebooting...")
          client:publish(mqtt_status_channel(), thx_reboot_response, MQTT_LWT_QOS, MQTT_LWT_RETAIN)
          node.restart()
        else
          file.rename("thinx.bak", "thinx.lua")
          print("* THiNX: Update from URL failed...")
        end
      else
        print("* THiNX: HTTP Update request failed with status: "..code)
      end
    end
  end)
end

-- the update payload may contain files, URL or OTT
function update_and_reboot(payload)

  -- update variants
  local type  = payload['type'] -- defaults to file
  local files = payload['files']
  local ott   = payload['ott']
  local url   = payload['url']
  local name  = "thinx.lua"

  -- as a default for NodeMCU, files are updated instead of whole firmware
  if type ~= nil then
    type = "file"
  end

  if files then
    file.rename("thinx.lua", "thinx.bak") -- backup
    local success = false
    for file in files do
      local name = file['name']
      local data = file['data']
      local url = file['url']
      if (name and data) then
        success = update_file(name, data)
      elseif (name and url) then
        update_from_url(name, url)
        success = true -- why?
      else
        print("* THiNX: MQTT Update payload has invalid file descriptors.")
      end
    end
  else
    print("* THiNX: MQTT Update payload is missing file descriptors.")
  end

  if ott then
    if type == "file" then
      url = 'http://' .. THINX_CLOUD_URL .. ':7442/device/firmware?ott=' .. ott
      print("* THiNX: Updating " .. name .. " from " .. url)
      update_from_url(name, url)
      success = true
    else
      print("* THiNX: Whole firmware update will be supported in future.")
    end
  end

  if url then
    if type == "file" then
      print("* THiNX: Updating " .. name .. " from URL " .. url)
      update_from_url(name, url)
      print("* THiNX: rebooting...")
      success = true
    else
      print("Whole firmware update will be supported in future.")
    end
  end

  if success then
    print("* THiNX: Update successful, rebooting...")
    client:publish(mqtt_status_channel(), thx_reboot_response, MQTT_LWT_QOS, MQTT_LWT_RETAIN)
    node.restart()
  else
    file.rename("thinx.bak", "thinx.lua")
    print("* THiNX: Update aborted.")
  end

end

--
-- CORE LOOP
--

function thinx()
    restore_device_info()
    connect(THINX_ENV_SSID, THINX_ENV_PASS) -- calls register an mqtt, uses Environment variables
end

thinx()
