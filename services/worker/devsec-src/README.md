# DevSec

Example implementation of DevSec Server class for Arduino/ESP. Class should be able to generate the device signature and respective header file.

Should be written in C/C++ and run inside the Docker container (x86).

Maybe python would be better, we'll see. Source is in C/C++ anyway.

### Build (Mac, Linux)

	// Compile
	$ ./build.sh

	Output file is in thinx-device-api ROOT and will be named after respective OS (devsec-mac or devsec-linux).

### Usage

Following command should return signature bytes. CKEY is a string, MAC is right half of device's MAC address and FCID is FlashChipID (with debug -d flag enabled prints more for debugging).

		../../devsec-mac -c "Shared encryption key." \
						 -m DD:EE:FF \
						 -f XXDDII \
						 -s WIFI_SSID \
						 -p WIFI_PASSWORD \
						 > ./src/embedded_signature.h
