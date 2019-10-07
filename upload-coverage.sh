#!/bin/bash

export CODACY_PROJECT_TOKEN=9a7d084ad97e430ba12333f384b44255
cat lcov.info | codacy-coverage

export CODECOV_TOKEN="734bc9e7-5671-4020-a26e-e6141f02b53d"
codecov -t 734bc9e7-5671-4020-a26e-e6141f02b53d

export CC_TEST_REPORTED_ID="e181ad1424f8f92834a556089394b2faadf93e9b6c84b831cefebb7ea06a8328"
cc-test-reporter format-coverage ./lcov.info -t lcov -o ./codeclimate.json
cc-test-reporter upload-coverage -r e181ad1424f8f92834a556089394b2faadf93e9b6c84b831cefebb7ea06a8328 -i ./codeclimate.json
