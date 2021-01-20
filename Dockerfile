FROM node:current-buster-slim

# docker build -t suculent/thinx-device-api .

ARG ROLLBAR_ENVIRONMENT
ARG THINX_HOSTNAME
ARG THINX_OWNER_EMAIL
ARG REVISION
ARG ROLLBAR_ACCESS_TOKEN
ARG ROLLBAR_ENVIRONMENT
ARG COUCHDB_USER
ARG COUCHDB_PASSWORD

ARG ENVIRONMENT
ENV ENVIRONMENT=${ENVIRONMENT}

ENV COUCHDB_USER=${COUCHDB_USER}
ENV COUCHDB_PASSWORD=${COUCHDB_PASSWORD}

ARG DEBIAN_FRONTEND=noninteractive

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG SQREEN_APP_NAME
ENV SQREEN_APP_NAME=${SQREEN_APP_NAME}

ARG SQREEN_TOKEN
ENV SQREEN_TOKEN=${SQREEN_TOKEN}

ENV THINX_HOSTNAME=${THINX_HOSTNAME}
RUN echo ${THINX_HOSTNAME}

ENV THINX_OWNER_EMAIL=${THINX_OWNER_EMAIL}
RUN echo ${THINX_OWNER_EMAIL}

ENV REVISION=${REVISION}
RUN echo ${REVISION}

ARG AQUA_SEC_TOKEN
ENV AQUA_SEC_TOKEN=${AQUA_SEC_TOKEN}

ARG SNYK_TOKEN
ENV SNYK_TOKEN=${SNYK_TOKEN}

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

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
    xfsprogs \
    xz-utils \
    net-tools \
    git \
    jq \
    zip \
    && rm -rf /var/lib/apt/lists/*

# Install app dependencies
COPY package.json ./

COPY .snyk ./.snyk

# second npm install is using package_lock to fix pinned transient dependencies
RUN openssl version \
 && node -v \
 && npm update \
 && npm install --unsafe-perm . --only-prod \
 && npm install --unsafe-perm . --only-prod \
 && npm audit fix

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

RUN set -eux; \
	wget -O /usr/local/bin/dind "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind"; \
	chmod +x /usr/local/bin/dind

VOLUME /var/lib/docker

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# GitLab Webbook (optional, moved to HTTPS)
EXPOSE 9002

# Copy app source code
COPY . .

# those packages should not be required and pose HIGH security risks
# g++ is a DevSec build-only dependency, imagemagick source is currently unknown but it is definitely not required
RUN apt-get remove -y \
    imagemagick \
    && apt-get autoremove -y \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

#ADD https://get.aquasec.com/microscanner .
#RUN chmod +x microscanner && mkdir artifacts
#RUN ./microscanner ${AQUA_SEC_TOKEN} --html --continue-on-failure > ./artifacts/microscanner.html \
#    && cp ./artifacts/microscanner.html ./static/microscanner.html
#RUN rm -rf ./microscanner

RUN mkdir -p ./.nyc_output

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

# Does not work on r/o filesystem
# RUN sysctl net.ipv4.ip_forward=1 && sysctl -w net.ipv4.conf.all.forwarding=1

ENTRYPOINT [ "/docker-entrypoint.sh" ]
