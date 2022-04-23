#!/bin/bash

# Generate CA private key (without password just for test)

openssl genrsa -out testCA.key 2048

# Next, we generate a root certificate with it

openssl req -new \
            -x509 \
            -sha256 \
            -days 1 \
            -nodes \
            -key testCA.key \
            -out testRoot.crt \
            -keyout testRoot.key \
            -subj "/C=SI/ST=Ljubljana/L=Ljubljana/O=Security/OU=IT Department/CN=thinx.test"

# Next, the developer comes and generates a CSR...

openssl genrsa -out thinx.test.key 2048

openssl req -newkey rsa:4096 \
            -nodes \
            -key thinx.test.key \
            -out thinx.test.csr \
            -subj "/C=SI/ST=Ljubljana/L=Ljubljana/O=Test/OU=Test Department/CN=test.thinx.cloud"

# Next, on the CA side...

openssl x509 -req \
-in thinx.test.csr \
-CA testRoot.crt \
-CAkey testCA.key \
-CAcreateserial \
-out thinx.test.out.crt \
-days 1 \
-sha256 \
-extfile _thinx.test.ext