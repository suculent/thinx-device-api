#!/bin/bash

docker build -t thinx/base-app-image .

docker push thinx/base-app-image:latest
