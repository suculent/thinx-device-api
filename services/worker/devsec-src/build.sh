#!/bin/sh

echo "Building DevSec binary for Linux..."
g++ -std=c++11 main.cpp devsec.cpp -o ../devsec
