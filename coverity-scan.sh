#!/bin/bash

cov-build --dir cov-int --no-command --fs-capture-search ./

zip -rq thinx-device-api.zip cov-int

