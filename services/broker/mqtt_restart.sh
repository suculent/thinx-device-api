kill -HUP $(ps -ax | grep 'mosquitto -v' | grep -v 'grep' | awk '{print $1}')

