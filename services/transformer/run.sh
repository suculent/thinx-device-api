#!/bin/bash

docker run --user=transformer -d -p 7474 -v /var/logs:/logs -v /opt/thinx-node-transformer:/app suculent/thinx-node-transformer
