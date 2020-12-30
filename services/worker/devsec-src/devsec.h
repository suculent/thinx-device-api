// #include <Arduino.h> why? because of byte only?

#include <iomanip>
#include <sstream>
#include <string>
#include <cstdint>

#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

#define SIGBASE "TH:NX"

// enable output
#define DEBUG

class DevSec {

  public:

    std::string intToHexString(int intValue);

    DevSec();                                     // generates local signature

    void setDebug(bool val);
    bool debug;

    void set_credentials(char *ssid, char* pass);
    void generate_signature(char * mac, char * ckey, char * fcid);
    char * signature();
    char * unsignature(char * ckey);
    void print_signature(char * ssid, char * password);                       // output local signature as code
    bool validate_signature(char * signature, char *ckey);    // validate signature reference against ckey

    char * decrypt(uint8_t input[]);  // encrypts/decrypts using CKEY (only if signature validated); should return null-terminated.
    char * encrypt(uint8_t input[]);  // encrypts/decrypts using CKEY (only if signature validated); should return null-terminated.

    void cleanup();                               // force removing private data

    char dsig[21];                                // local device signature [20+\0]
    char usig[32];                                // temporary unsignature store
    char key[64];                                 // obfuscation key in length of CKEY

  private:

    bool dsig_created;
    bool dsig_valid;

    char crypted[64]; // 64 should be OK for now... (key)

    char ssid[32];
    char password[32];

};
