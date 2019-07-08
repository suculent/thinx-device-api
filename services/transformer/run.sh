#/bin/bash

docker run --user=transformer -d -p 7475:7474 -v /var/logs:/logs -v /root/thinx-node-transformer:/app suculent/thinx-node-transformer

