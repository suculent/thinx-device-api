#!/bin/bash

# Execute THiNX Device Postman collection

# cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12
# 7e7d12c86adaa2a2858661cdb71750dc2dc155740a7ab71ce2cba4866ea70a20

docker run -t postman/newman:ubuntu run "https://www.getpostman.com/collections/b8107e13a64b880b3e45"
