FROM node:11.13

# docker build -t suculent/thinx-device-api .

# RUN INTERACTIVE:
# docker run -ti -e THINX_HOSTNAME='staging.thinx.cloud' \
#                -e THINX_OWNER='suculent@me.com' \
#                -e REVISION=$(git rev-list head --count) \
#                -v /mnt/data/mosquitto/auth:/mnt/data/mosquitto/auth
#                -v /mnt/data/mosquitto/log:/mnt/data/mosquitto/log
#                -v /mnt/data/mosquitto/data:/mnt/data/mosquitto/data
#                -v /mnt/data/mosquitto/ssl:/mnt/data/mosquitto/ssl
#                   suculent/thinx-device-api bash

ARG DEBIAN_FRONTEND=noninteractive

ARG THINX_HOSTNAME
ARG THINX_OWNER_EMAIL
ARG REVISION

ARG DEBIAN_FRONTEND=noninteractive

# Enter FQDN you own, should have public IP
ENV THINX_HOSTNAME=staging.thinx.cloud

# Add your e-mail to take control of LSE SSL certificate.
ENV THINX_OWNER_EMAIL=suculent@me.com

# Update when running using `-e REVISION=$(git rev-list head --count)`
ENV REVISION=4030

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

RUN apt-get update -qq \
    && apt-get install -qqy apt-utils

RUN curl -sSL https://get.docker.com/ | sh

# Install OpenSSL/GnuTLS to prevent Git Fetch issues
RUN apt-get install -qqy \
    mosquitto \
    openssl \
    gnutls-bin \
    apt-transport-https \
    ca-certificates \
    curl \
    lxc \
    iptables

RUN curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash

# Install app dependencies
COPY package*.json ./

# Copy app source code
COPY . .
		

RUN export NVM_DIR="$HOME/.nvm" \
          && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" \
          && npm install -g pm2 \
          && npm install

# Installs all tools, not just those currently allowed by .dockerignore
# RUN cd tools \
#  && bash ./install-builders.sh \
#  && bash ./install-tools.sh

# Install the magic wrapper.
# FAILS: with no such file or directory: ADD ./wrapdocker /usr/local/bin/wrapdocker
# RUN chmod +x /usr/local/bin/wrapdocker

# Define additional metadata for our image.
VOLUME /var/lib/docker

# Reserved
EXPOSE 7440

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# THiNX Web API Notification Socket
EXPOSE 7444

# GitLab Webbook
EXPOSE 9000

# EXPOSE 9001 # Reserved by MQTT Websocket; cannot be used!

# TODO: Cleanup for security reasons

ADD ./docker-entrypoint.sh /docker-entrypoint.sh
ENTRYPOINT [ "/docker-entrypoint.sh" ]
