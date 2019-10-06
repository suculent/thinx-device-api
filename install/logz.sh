#!/bin/bash

wget https://raw.githubusercontent.com/logzio/public-certificates/master/COMODORSADomainValidationSecureServerCA.crt
sudo mkdir -p /etc/pki/tls/certs
sudo cp COMODORSADomainValidationSecureServerCA.crt /etc/pki/tls/certs/

#curl -L -O https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-5.5.0-amd64.deb
#sudo dpkg -i filebeat-5.5.0-amd64.deb

wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -
sudo apt-get install apt-transport-https
echo "deb https://artifacts.elastic.co/packages/5.x/apt stable main" | sudo tee -a /etc/apt/sources.list.d/elastic-5.x.list
sudo apt-get update -qq && sudo apt-get install filebeat


mkdir -p /etc/filebeat
cp ./filebeat.yml /etc/filebeat/filebeat.yml
