# TODO: needs rocker hub reorganization to thinx/core-api and extracted thinx/device-api
# SOFAR:
# docker build -t suculent/thinx-device-api .

# IMPORTED docker run -ti -e THINX_HOSTNAME='staging.thinx.cloud' -e THINX_OWNER='suculent@me.com' suculent/thinx-docker

ARG DEBIAN_FRONTEND=noninteractive
ARG THINX_HOSTNAME
MAINTAINER suculent

# Enter FQDN you own, should have public IP
ENV THINX_HOSTNAME staging.thinx.cloud

# Add your e-mail to take control of SSL certificate.
ENV THINX_OWNER_EMAIL suculent@me.com

# TODO: all bash commands will fail, needs to install git and others from thinx install sequence
FROM node:alpine

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

# Install app dependencies
COPY package*.json ./
RUN npm install -g pm2
RUN npm install

# Copy app source code
COPY . .

# Expose port and start application
EXPOSE 7440
EXPOSE 7442
EXPOSE 7443
EXPOSE 7444

# Webhooks (should be only one for customers, thinx is immutable in docker)
EXPOSE 9000
EXPOSE 9001

CMD [ "pm2", "start", "ecosystem.json" ]

