#!/bin/bash

if [[ $(uname -s) == "Darwin" ]]; then
  echo "Building DevSec binary for Mac OS..."
  g++ main.cpp devsec.cpp -o ../../devsec-mac
elif [[ $(uname -s) == "Linux" ]]; then
  echo "Building DevSec binary for Linux..."
  g++ -std=c++11 main.cpp devsec.cpp -o ../../devsec-linux
else
  echo "Unsupported platform for building."
  exit 1
fi
