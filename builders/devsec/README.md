# DevSec

Example implementation of DevSec Server class for Arduino/ESP. Class should be able to generate the device signature and respective header file.

Should be written in C/C++ and run inside the Docker container (x86).

Maybe python would be better, we'll see. Source is in C/C++ anyway.

### Build on OSX

	// Compile
	$ ./build.sh

	// Test with invalid arguments should provide help:

	$ ./devsec -d

### Build on Linux

	// Compile
	$ g++ -std=c++11 main.cpp devsec.cpp -o main && cp main devsec

### Usage

Following command should return signature bytes. CKEY is a string, MAC is device's MAC address and FCID is FlashChipID (with debug -d flag enabled prints more for debugging).

		./devsec -c "Shared encryption key." \
						 -m FF:00:AA:BB:CC:DD \
						 -f MMCCLLXXDDII \
						 > ./src/embedded_signature.h
