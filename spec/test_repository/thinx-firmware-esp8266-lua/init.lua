-- init.lua
local IDLE_AT_STARTUP_MS = 3000
print("Will bootstrap in 3 seconds...")
tmr.alarm(1,IDLE_AT_STARTUP_MS,0,function()
    dofile("thinx.lua")--Write your program name in dofile
end)
