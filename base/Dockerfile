# docker build -t registry.thinx.cloud:5000/thinx/base-app-image .

FROM node:current-buster-slim

RUN adduser --system --disabled-password --shell /bin/bash thinx

# WHY? See blame.
RUN sh -c "echo 'Dir::Ignore-Files-Silently:: \"(.save|.distupgrade)$\";' > /etc/apt/apt.conf.d/99ignoresave"

# RUN sed -i 's/main/main contrib non-free/g' /etc/apt/sources.list && \
RUN apt-get update -qq && \
    apt-get install -qq -y --fix-missing --no-install-recommends \
    apt-transport-https \
    apt-utils \
    btrfs-progs \
    ca-certificates \
    curl \
    e2fsprogs \
    gnutls-bin \
    iptables \
    lxc \
    mosquitto \
    mercurial \
    pigz \
    python \
    python-pip \
    ssh \
    xfsprogs \
    xz-utils \
    net-tools \
    git \
    jq \
    zip \
    && rm -rf /var/lib/apt/lists/*

ENV VER="20.10.1"
RUN curl -sL -o /tmp/docker-$VER.tgz https://download.docker.com/linux/static/stable/x86_64/docker-$VER.tgz && \
    tar -xz -C /tmp -f /tmp/docker-$VER.tgz && \
    rm -rf /tmp/docker-$VER.tgz && \
   mv /tmp/docker/* /usr/bin

# set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
RUN set -x \
	&& addgroup dockremap --gid 65536 \
	&& adduser --system dockremap --gid 65536 \
	&& echo 'dockremap:165536:65536' >> /etc/subuid \
	&& echo 'dockremap:165536:65536' >> /etc/subgid

# https://github.com/docker/docker/tree/master/hack/dind is this really needed now?
ENV DIND_COMMIT 37498f009d8bf25fbb6199e8ccd34bed84f2874b

WORKDIR /opt/thinx/thinx-device-api

# Install app dependencies
# package.json should be link to ../package.json
COPY ./package.json ./
COPY .snyk ./.snyk

# install with npx and audit fix
RUN npm update \
 && npm install --unsafe-perm . --only-prod \
 && npm install --unsafe-perm . --only-prod
## && npm audit fix -- fails with buster, why? because of different node version