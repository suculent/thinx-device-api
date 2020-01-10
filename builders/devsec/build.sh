#!/bin/bash

if $(uname -a) == "darwin"; then
  g++ main.cpp devsec.cpp -o devsec
fi

if $(uname -a) == "linux"; then
  g++ -std=c++11 main.cpp devsec.cpp -o devsec
fi
