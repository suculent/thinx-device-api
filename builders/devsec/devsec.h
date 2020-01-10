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
// #define CKEY "Not enough memory for this operation."

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
    void print_signature();                       // output local signature as code
    bool validate_signature(char * signature, char *ckey);    // validate signature reference against ckey

    char * endecrypt(uint8_t input[]);  // encrypts/decrypts using CKEY (only if signature validated)

    void cleanup();                               // force removing private data

    char dsig[64];                                // local device signature [26]
    char usig[64];    // temporary unsignature store
    char key[38];                          // obfuscation key in length of CKEY

  private:

    bool dsig_created;
    bool dsig_valid;

    char crypted[256]; // 256 should be OK for now...
    char flash_chip_id[13];  // 13 chars and string end...

    char ssid[32];
    char password[32];

};
