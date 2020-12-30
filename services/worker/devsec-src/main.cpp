#include "devsec.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void do_it(char *ckey, char* mac, char *fcid, char *ssid, char *pass, int debug) {

  if (debug)
    printf ("ckey = %s, mac = %s, fcid = %s, ssid = %s, pass = %s, debug = %i\n", ckey, mac, fcid, ssid, pass, debug);

  DevSec * sec = new DevSec();

  // generate signature
  sec->setDebug((bool)debug);

  sec->generate_signature(mac, ckey, fcid);

  // fetch as string
  sec->signature();

  // print as bytes to output with attached credentials
  sec->print_signature(ssid, pass);

  // simulate encoded byte signature from device for verification
  char *unsignature = sec->unsignature(ckey);

  if (debug) printf("\nValidating unsignature... ");

  bool isValid = sec->validate_signature(unsignature, ckey);    // validate signature reference against local
  if (isValid) {
    if (debug) printf ("valid.\n");
  } else {
    if (debug) printf ("invalid.\n");
    exit(1);
  }

  sec->set_credentials(ssid, pass);

#ifdef TEST
  printf ("Testing endecrypt...\n");
  uint8_t input[255] = {0};
  char test_string[] = "TESTING TESTING-HELLO_HELLO.";
  sprintf((char*)input, "%s", test_string);
  // printf ("array string: %s\n", (char*)input);

  char * output = sec->encrypt(input);  // encrypts/decrypts byte array using CKEY (only if signature validated)
  // printf ("ENCODED: %s\n", output);

  sprintf((char*)input, "%s", output);
  char *output2 = sec->decrypt(input);
  // printf ("DECODED: %s\n", (char*)output2);

  if (strcmp((char*)test_string, output2) == 0) {
    printf("Encoding test succeeded.\n");
  } else {
    printf("Encoding test failed.\n");
    printf("%s\n", (char*)test_string);
    printf("%s\n", output2);
  }

  printf ("Testing cleanup...\n");
  sec->cleanup();

  printf ("Checking emptyness...\n");
  sec->print_signature(); // should be empty now

  printf ("Validation should fail now without key: \n");
  isValid = sec->validate_signature(unsignature, ckey);
  if (isValid) {
    if (debug) printf ("valid.\n");
  } else {
    if (debug) printf ("invalid.\n");
  }

#endif

}

int main(int argc, char *argv[])
{

  printf("\n/*\n * THiNX DevSec Signer v0.128\n */\n\n");

  int dflag = 0; // debug

  char *cvalue = NULL; // Crypto Key
  char *uvalue = NULL; // UDID
  char *fvalue = NULL; // Flash Chip ID
  char *svalue = NULL; // WiFi SSID
  char *pvalue = NULL; // WiFi Password
  int index;
  int c;

  opterr = 0;

  if (argc < 1) {
    // does not work
    // return 0;
  }

  while ((c = getopt (argc, argv, "s:p:c:m:f:d")) != -1)
    switch (c)
      {
      case 'd':
        dflag = 1; // debug
        break;
      case 'c':
        cvalue = optarg;
        break;
      case 'm':
        uvalue = optarg;
        break;
      case 'f':
        fvalue = optarg;
        break;
      case 's':
        svalue = optarg;
        break;
      case 'p':
        pvalue = optarg;
        break;
      case '?':
        if (optopt == 'c')
          fprintf (stderr, "Option -%c requires CKEY as an argument.\n", optopt);
        else if (optopt == 'm')
            fprintf (stderr, "Option -%c requires MAC as an argument.\n", optopt);
        else if (optopt == 'f')
            fprintf (stderr, "Option -%c requires FCID as an argument.\n", optopt);
        else if (optopt == 's')
            fprintf (stderr, "Option -%c requires SSID as an argument.\n", optopt);
        else if (optopt == 'p')
            fprintf (stderr, "Option -%c requires PASS as an argument.\n", optopt);
        else if (isprint (optopt))
          fprintf (stderr, "Unknown option `-%c'.\n", optopt);
        else {
          fprintf (stderr, "Unknown option character `\\x%x'.\n", optopt);
        }

        return 1;
      default:
        abort ();
      }

  bool option_error = false;
  for (index = optind; index < argc; index++) {
    printf ("Non-option argument %s\n", argv[index]);
    option_error = true;
  }

  if (option_error) {
    printf ("Exiting on option_error");
    exit(3);
  }

  if ((cvalue != NULL) && (uvalue != NULL) && (fvalue != NULL)) {
    do_it(cvalue, uvalue, fvalue, svalue, pvalue, (bool)dflag);
  } else {
    printf("Usage: ./devsec -c <ckey> -m <mac> -f <flash-chip-id> -s <ssid> -p <password>\n");
    printf("Debug: ./devsec -d -c <ckey> -m <mac> -f <flash-chip-id> -s <ssid> -p <password>\n");
  }

  return 0;
}
