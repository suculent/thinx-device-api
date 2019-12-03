#!/bin/bash

cov-build --dir cov-int --no-command --fs-capture-search ./

zip -r thinx-device-api.zip cov-int

