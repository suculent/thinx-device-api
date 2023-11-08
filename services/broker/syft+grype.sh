syft thinxcloud/mosquitto -o json > syft.json
cat syft.json | grype --add-cpes-if-none  --output sarif --file grype.sarif
