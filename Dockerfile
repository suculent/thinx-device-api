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

# Install app dependencies
COPY package*.json ./

# Copy app source code
COPY . .

# Install OpenSSL/GnuTLS to prevent Git Fetch issues
RUN apt-get update \
    && apt-get install -y openssl gnutls-bin git \
		&& git config http.sslVerify false \
		&& git config --global http.postBuffer 1048576000
		
RUN curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash \
	  && export NVM_DIR="$HOME/.nvm" \
#		&& [ -s "$NVM_DIR/nvm.sh" ] \
#		&& \. "$NVM_DIR/nvm.sh" \
    && npm install -g pm2 \
    && npm install

RUN apt-get update \
 && apt-get install -y mosquitto

# Let's add with some basic stuff.
RUN apt-get update -qq && apt-get install -qqy \
    apt-transport-https \
    ca-certificates \
    curl \
    lxc \
    iptables

# Install Docker from Docker Inc. repositories.
RUN curl -sSL https://get.docker.com/ | sh

# Install the magic wrapper.
# FAILS: with no such file or directory: ADD ./wrapdocker /usr/local/bin/wrapdocker
# RUN chmod +x /usr/local/bin/wrapdocker

# Define additional metadata for our image.
VOLUME /var/lib/docker

# Installs all tools, not just those currently allowed by .dockerignore
# RUN cd tools \
#  && bash ./install-builders.sh \
#  && bash ./install-tools.sh

# Expose port and start application
EXPOSE 7440
EXPOSE 7442
EXPOSE 7443
EXPOSE 7444

# Webhooks (should be only one for customers, thinx is immutable in docker)
EXPOSE 9000
EXPOSE 9001

CMD [ "pm2", "start", "ecosystem.json" ]
