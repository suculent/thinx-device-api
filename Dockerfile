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
ARG THINX_HOSTNAME
ARG THINX_OWNER_EMAIL
ARG REVISION

ARG DEBIAN_FRONTEND=noninteractive

# Used for redirects back to Web
ENV THINX_HOSTNAME=${THINX_HOSTNAME}

# Enter FQDN you own, should have public IP
ENV THINX_HOSTNAME=${THINX_HOSTNAME}

# Update when running using `-e REVISION=$(git rev-list head --count)`
ENV REVISION=4294

ENV NODE_ENV=production

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

# WHY? See blame.
RUN sh -c "echo 'Dir::Ignore-Files-Silently:: \"(.save|.distupgrade)$\";' > /etc/apt/apt.conf.d/99ignoresave"

# RUN sed -i 's/main/main contrib non-free/g' /etc/apt/sources.list && \
RUN apt-get update && \
    apt-get install -y --fix-missing --no-install-recommends \
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
    pigz \
    python-pip \
    xfsprogs \
    xz-utils \
    net-tools \
    git \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Docker
# RUN curl -sSL https://get.docker.com/ | sh

# Install Docker Client only (Docker is on the host) - fails with /bin/sh not found...
ENV VER="17.03.0-ce"
RUN curl -v -L -o /tmp/docker-$VER.tgz https://download.docker.com/linux/static/stable/x86_64/docker-$VER.tgz
RUN tar -xz -C /tmp -f /tmp/docker-$VER.tgz
RUN mv /tmp/docker* /usr/bin

# Install app dependencies
COPY package*.json ./

# Copy app source code
COPY . .

RUN openssl version \
 && node -v \
 && npm install --only-prod .

# set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
RUN set -x \
	&& addgroup dockremap --gid 65536 \
	&& adduser --system dockremap --gid 65536 \
	&& echo 'dockremap:165536:65536' >> /etc/subuid \
	&& echo 'dockremap:165536:65536' >> /etc/subgid

# https://github.com/docker/docker/tree/master/hack/dind is this really needed now?
ENV DIND_COMMIT 37498f009d8bf25fbb6199e8ccd34bed84f2874b

RUN set -eux; \
	wget -O /usr/local/bin/dind "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind"; \
	chmod +x /usr/local/bin/dind

VOLUME /var/lib/docker

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# THiNX Web API Notification Socket
EXPOSE 7444

# GitLab Webbook
EXPOSE 9002

# this should be generated with sed on entrypoint, entrypoint needs /.first_run file
COPY ./.thinx_env /.thinx_env


COPY ./docker-entrypoint.sh /docker-entrypoint.sh
ENTRYPOINT [ "/docker-entrypoint.sh" ]
