# TODO: needs rocker hub reorganization to thinx/core-api and extracted thinx/device-api SOFAR: docker build -t 
# suculent/thinx-device-api .

# IMPORTED docker run -ti -e THINX_HOSTNAME='staging.thinx.cloud' -e THINX_OWNER='suculent@me.com' suculent/thinx-docker

FROM ubuntu:16.04

MAINTAINER suculent

ARG DEBIAN_FRONTEND=noninteractive

# Enter FQDN you own, should have public IP
ENV THINX_HOSTNAME staging.thinx.cloud

# Add your e-mail to take control of SSL certificate.
ENV THINX_OWNER_EMAIL suculent@me.com

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

# Install app dependencies
COPY package*.json ./

# Copy app source code
COPY . .

RUN apt-get update && apt-get install -y software-properties-common python-software-properties

##
#  Core
##

RUN apt-get update && apt-get install -y \
 apt-utils \
 curl \
 git \
 make \
 netcat \
 pwgen \
 python-dev \
 python \
 python-pip \
 wget \
 unzip

RUN echo "TODO: Install node using nvm" && npm install nvm && nvm install 11.13

RUN apt-get install -y nodejs && npm install -g pm2 && npm install

# Expose port and start application
EXPOSE 7440
EXPOSE 7442
EXPOSE 7443
EXPOSE 7444

# Webhooks (should be only one for customers, thinx is immutable in docker)
EXPOSE 9000
EXPOSE 9001

CMD [ "pm2", "start", "ecosystem.json" ]

