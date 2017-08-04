-- init.lua
local IDLE_AT_STARTUP_MS = 10000 -- debug only, 3 sec. is OK in production
print("Will bootstrap in 10 seconds (adjustable in init.lua)...")
tmr.alarm(1,IDLE_AT_STARTUP_MS,0,function()
    dofile("thinx.lua")--Write your program name in dofile
end)
