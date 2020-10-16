#!/bin/bash

# Copyright © 2020 Richard Prajer
# This script should be run in /mnt/local/repos or /mnt/data/repos folders (on the owner-id level)

for dir in */*; do find $PWD/$dir -type d -printf "%T@\t%p\n" | sort -t $'\t' -g | sed '1d; $d' | cut -d $'\t' -f 2 | xargs rm -r -- ; done