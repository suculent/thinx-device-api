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

ARG APP_HOSTNAME
ARG THINX_HOSTNAME
ARG THINX_OWNER_EMAIL
ARG REVISION

ARG DEBIAN_FRONTEND=noninteractive

# Used for redirects back to Web
ENV APP_HOSTNAME=${APP_HOSTNAME}

# Enter FQDN you own, should have public IP
ENV THINX_HOSTNAME=${THINX_HOSTNAME} # was app.keyguru.eu

# Update when running using `-e REVISION=$(git rev-list head --count)`
ENV REVISION=4135

ENV NODE_ENV=production

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

RUN sed -i 's/main/main contrib non-free/g' /etc/apt/sources.list && \
    apt-get update -qq && \
    apt-get install -qqy \
    apt-transport-https \
    apt-utils \
    btrfs-progs \
    ca-certificates \
    cppcheck \
    curl \
    e2fsprogs \
    gnutls-bin \
    iptables \
    lxc \
    mosquitto \
    openssl \
    pigz \
    python-pip \
    xfsprogs \
    xz-utils \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSL https://get.docker.com/ | sh

# Install NVM to manage Node versions with PM2
RUN curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash

# Install app dependencies
COPY package*.json ./

# Copy app source code
COPY . .

RUN export NVM_DIR="$HOME/.nvm" \
          && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" \
          && npm install -g pm2 eslint \
          && npm install

#    && zfs-dkms

# only install zfs if it's available for the current architecture
# https://git.alpinelinux.org/cgit/aports/tree/main/zfs/APKBUILD?h=3.6-stable#n9 ("all !armhf !ppc64le" as of 2017-11-01)
# "apk info XYZ" exits with a zero exit code but no output when the package exists but not for this arch
#	if zfs="$(apk info --no-cache --quiet zfs)" && [ -n "$zfs" ]; then \
#		apt-get install -y zfs; \
#	fi

# set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
RUN set -x \
	&& addgroup dockremap --gid 65536 \
	&& adduser --system dockremap --gid 65536 \
	&& echo 'dockremap:165536:65536' >> /etc/subuid \
	&& echo 'dockremap:165536:65536' >> /etc/subgid

# https://github.com/docker/docker/tree/master/hack/dind
ENV DIND_COMMIT 37498f009d8bf25fbb6199e8ccd34bed84f2874b

RUN set -eux; \
	wget -O /usr/local/bin/dind "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind"; \
	chmod +x /usr/local/bin/dind

VOLUME /var/lib/docker
# EXPOSE 2375

#
# << DIND
#

RUN mkdir -p /ssh-keys

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# THiNX Web API Notification Socket
EXPOSE 7444

# GitLab Webbook
EXPOSE 9002

COPY ./docker-entrypoint.sh /docker-entrypoint.sh
ENTRYPOINT [ "/docker-entrypoint.sh" ]
